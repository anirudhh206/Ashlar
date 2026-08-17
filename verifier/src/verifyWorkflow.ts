/**
 * Orchestrates full independent verification of one workflow's proof chain: structural
 * consistency (attested steps match the compiled sequence, ledger matches attestations) plus,
 * for every attested step, fetching the actual originating transaction, decoding its real
 * instruction args via the Anchor IDL, confirming the signer, and recomputing the on-chain hash
 * to compare against Attestation.data_hash. See hashRecompute.ts for why this is necessary (2 of
 * the 5 step kinds have no recoverable preimage in final account state at all).
 */
import { PublicKey } from '@solana/web3.js';
import type { BN, BorshInstructionCoder } from '@anchor-lang/core';
import {
  type ChainClient,
  deriveWorkflowPdas,
  fetchWorkflowInstance,
  fetchLedger,
  fetchAttestation,
  explorerLink,
} from './chainClient.js';
import {
  fetchStepPreimage,
  complianceOrApprovalPreimage,
  guardrailCheckPreimage,
  mockSettlementPreimage,
  settleDirectTransferPreimage,
  resumeAfterOverridePreimage,
  keccak256Hex,
  bytesToHex,
} from './hashRecompute.js';

/** settle_direct_transfer's 8 named accounts (owner, workflow, attestation, ledger, mint,
 * owner_token_account, token_program, system_program) — anything after this in the instruction's
 * account list is a remaining_account (one recipient token account per real recipient). Mirrors
 * the account order in programs/ashlar/src/instructions/settle_direct_transfer.rs's Accounts
 * struct exactly. */
const SETTLE_DIRECT_TRANSFER_NAMED_ACCOUNT_COUNT = 8;

/** A token account's owner (the wallet authorized to spend from it) lives at byte offset 32..64
 * of the SPL Token account layout — same raw read `anchor_spl::token::accessor::authority` does
 * on-chain, done here client-side since there's no Anchor account decoder for it in this package. */
async function readTokenAccountOwner(connection: ChainClient['connection'], ata: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(ata);
  if (!info) throw new Error(`recipient token account ${ata.toBase58()} does not exist on-chain`);
  return new PublicKey(info.data.subarray(32, 64));
}

export interface StepVerification {
  stepIndex: number;
  attestedStepKind: string;
  outcome: string;
  signature: string;
  explorerLink: string;
  decodedInstruction: string;
  signerVerified: boolean;
  hashVerified: boolean;
  detail?: string;
}

export interface VerificationReport {
  workflow: string;
  owner: string;
  workflowType: string;
  status: string;
  currentStep: number;
  structuralChecksPassed: boolean;
  structuralIssues: string[];
  steps: StepVerification[];
  overallPass: boolean;
}

/** Anchor's decoded instruction `data` field-name casing is not guaranteed camelCase vs
 * snake_case across versions — read defensively rather than assume one. */
function field(data: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (name in data) return data[name];
  }
  throw new Error(`none of [${names.join(', ')}] found in decoded instruction data: ${JSON.stringify(data)}`);
}

export async function verifyWorkflow(client: ChainClient, workflow: PublicKey): Promise<VerificationReport> {
  const workflowAccount = await fetchWorkflowInstance(client, workflow);
  const owner = workflowAccount.owner as PublicKey;
  const workflowIdBN = workflowAccount.workflowId as BN;
  const pdas = deriveWorkflowPdas(client.programId, owner, BigInt(workflowIdBN.toString()));
  const ledgerAccount = await fetchLedger(client, pdas.ledger);
  // pending_amount/pending_recipient are set by guardrail_check and persist unchanged through
  // settlement — final account state genuinely holds the exact values mock_settlement hashed.
  const workflowState = {
    pendingAmount: workflowAccount.pendingAmount as BN,
    pendingRecipient: workflowAccount.pendingRecipient as PublicKey,
  };

  const structuralIssues: string[] = [];
  const compiledSteps: string[] = (workflowAccount.steps as { toString(): string }[]).map((s) =>
    Object.keys(s as object)[0] ?? String(s),
  );
  const attestedCount = ledgerAccount.entries.length;

  // A terminal Rejected workflow that never reached all 4 steps is expected (rejected early) —
  // but a Completed workflow must have attested every compiled step.
  if ('completed' in (workflowAccount.status as object) && attestedCount !== compiledSteps.length) {
    structuralIssues.push(
      `status is Completed but only ${attestedCount}/${compiledSteps.length} steps were attested`,
    );
  }

  const steps: StepVerification[] = [];

  for (let i = 0; i < attestedCount; i++) {
    const ledgerEntry = ledgerAccount.entries[i]!;
    const attestationPda = pdas.attestationPda(i);
    const attestation = await fetchAttestation(client, attestationPda);

    const entryKind = Object.keys(ledgerEntry.stepKind as object)[0] ?? '';
    const attestationKind = Object.keys(attestation.stepKind as object)[0] ?? '';
    const compiledKind = compiledSteps[i];
    if (entryKind !== attestationKind) {
      structuralIssues.push(`step ${i}: ledger step_kind (${entryKind}) != attestation step_kind (${attestationKind})`);
    }
    if (compiledKind && entryKind !== compiledKind) {
      structuralIssues.push(`step ${i}: attested kind (${entryKind}) != compiled sequence kind (${compiledKind})`);
    }

    const outcome = Object.keys(attestation.outcome as object)[0] ?? '';
    const attestedDataHashHex = bytesToHex(attestation.dataHash as number[]);

    const signatures = await client.connection.getSignaturesForAddress(attestationPda, { limit: 5 });
    if (signatures.length === 0) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: '',
        explorerLink: '',
        decodedInstruction: '',
        signerVerified: false,
        hashVerified: false,
        detail: 'no on-chain transaction found for this attestation account',
      });
      continue;
    }
    // Ascending chronological order; the LAST one is authoritative (a resume_after_override
    // amends the same attestation PDA in place rather than creating a new one).
    const orderedSigs = [...signatures].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const latestSig = orderedSigs[orderedSigs.length - 1]!.signature;

    const tx = await client.connection.getTransaction(latestSig, { maxSupportedTransactionVersion: 0 });
    if (!tx) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: latestSig,
        explorerLink: explorerLink(latestSig),
        decodedInstruction: '',
        signerVerified: false,
        hashVerified: false,
        detail: 'transaction not found via getTransaction',
      });
      continue;
    }
    if (tx.meta?.err) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: latestSig,
        explorerLink: explorerLink(latestSig),
        decodedInstruction: '',
        signerVerified: false,
        hashVerified: false,
        detail: `transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
      });
      continue;
    }

    const message = tx.transaction.message;
    const accountKeys = message.staticAccountKeys;
    const ashlarIx = message.compiledInstructions.find(
      (ci) => accountKeys[ci.programIdIndex]?.equals(client.programId),
    );
    if (!ashlarIx) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: latestSig,
        explorerLink: explorerLink(latestSig),
        decodedInstruction: '',
        signerVerified: false,
        hashVerified: false,
        detail: 'no Ashlar-program instruction found in this transaction',
      });
      continue;
    }

    const instructionCoder = client.program.coder.instruction as BorshInstructionCoder;
    const decoded = instructionCoder.decode(Buffer.from(ashlarIx.data));
    if (!decoded) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: latestSig,
        explorerLink: explorerLink(latestSig),
        decodedInstruction: '',
        signerVerified: false,
        hashVerified: false,
        detail: 'instruction data could not be decoded via the IDL coder',
      });
      continue;
    }

    const numRequiredSignatures = message.header.numRequiredSignatures;
    const ownerIndex = accountKeys.findIndex((k) => k.equals(owner));
    const signerVerified = ownerIndex >= 0 && ownerIndex < numRequiredSignatures;

    let recomputedHash: string;
    const data = decoded.data as Record<string, unknown>;
    try {
      // Anchor's BorshInstructionCoder returns camelCase instruction names (e.g. `fetchStep`)
      // even though the raw IDL's own `name` field is snake_case (`fetch_step`) — confirmed by
      // decoding real devnet transactions, not assumed. Match defensively against both.
      if (decoded.name === 'fetchStep' || decoded.name === 'fetch_step') {
        recomputedHash = keccak256Hex(
          fetchStepPreimage(field(data, 'invoiceId', 'invoice_id') as BN, field(data, 'amount') as BN),
        );
      } else if (['complianceCheck', 'compliance_check', 'manualApproval', 'manual_approval'].includes(decoded.name)) {
        recomputedHash = keccak256Hex(complianceOrApprovalPreimage(field(data, 'approved') as boolean));
      } else if (decoded.name === 'guardrailCheck' || decoded.name === 'guardrail_check') {
        recomputedHash = keccak256Hex(
          guardrailCheckPreimage(field(data, 'amount') as BN, field(data, 'recipient') as PublicKey),
        );
      } else if (decoded.name === 'mockSettlement' || decoded.name === 'mock_settlement') {
        recomputedHash = keccak256Hex(
          mockSettlementPreimage(
            workflowState.pendingAmount,
            workflowState.pendingRecipient,
            field(data, 'settlementReference', 'settlement_reference') as string,
          ),
        );
      } else if (decoded.name === 'settleDirectTransfer' || decoded.name === 'settle_direct_transfer') {
        const recipientAtas = ashlarIx.accountKeyIndexes
          .slice(SETTLE_DIRECT_TRANSFER_NAMED_ACCOUNT_COUNT)
          .map((idx) => accountKeys[idx]!);
        const amounts = field(data, 'amounts') as BN[];
        if (recipientAtas.length !== amounts.length) {
          throw new Error(
            `settle_direct_transfer: ${recipientAtas.length} recipient accounts but ${amounts.length} amounts`,
          );
        }
        const legs = await Promise.all(
          recipientAtas.map(async (ata, j) => ({
            ownerPubkey: await readTokenAccountOwner(client.connection, ata),
            amount: amounts[j]!,
          })),
        );
        recomputedHash = keccak256Hex(
          settleDirectTransferPreimage(legs, field(data, 'settlementReference', 'settlement_reference') as string),
        );
      } else if (decoded.name === 'resumeAfterOverride' || decoded.name === 'resume_after_override') {
        recomputedHash = keccak256Hex(resumeAfterOverridePreimage(field(data, 'approved') as boolean));
      } else {
        throw new Error(`unrecognized instruction: ${decoded.name}`);
      }
    } catch (err) {
      steps.push({
        stepIndex: i,
        attestedStepKind: entryKind,
        outcome,
        signature: latestSig,
        explorerLink: explorerLink(latestSig),
        decodedInstruction: decoded.name,
        signerVerified,
        hashVerified: false,
        detail: `preimage reconstruction failed: ${(err as Error).message}`,
      });
      continue;
    }

    const hashVerified = recomputedHash === attestedDataHashHex;
    steps.push({
      stepIndex: i,
      attestedStepKind: entryKind,
      outcome,
      signature: latestSig,
      explorerLink: explorerLink(latestSig),
      decodedInstruction: decoded.name,
      signerVerified,
      hashVerified,
      ...(hashVerified ? {} : { detail: `expected ${attestedDataHashHex}, recomputed ${recomputedHash}` }),
    });
  }

  const structuralChecksPassed = structuralIssues.length === 0;
  const overallPass = structuralChecksPassed && steps.every((s) => s.signerVerified && s.hashVerified);

  return {
    workflow: workflow.toBase58(),
    owner: owner.toBase58(),
    workflowType: Object.keys(workflowAccount.workflowType as object)[0] ?? 'unknown',
    status: Object.keys(workflowAccount.status as object)[0] ?? 'unknown',
    currentStep: workflowAccount.currentStep as number,
    structuralChecksPassed,
    structuralIssues,
    steps,
    overallPass,
  };
}
