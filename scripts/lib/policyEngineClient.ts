/**
 * Shared devnet client for the on-chain Policy Engine — PDA derivation and one thin wrapper
 * per instruction. Used by both scripts/devnet/deploy-workflow.ts (Phase 2, manual walkthrough)
 * and the agent's tool-calling harness (Phase 3), so PDA-seed logic stays in exactly one place
 * and can't drift out of sync with programs/ashlar/src/constants.rs.
 */
import * as anchor from '@anchor-lang/core';
import { Program, AnchorProvider, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Ashlar } from '../../target/types/ashlar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IDL_PATH = path.join(REPO_ROOT, 'target', 'idl', 'ashlar.json');
const WALLET_PATH = path.join(REPO_ROOT, 'wallets', 'business-owner.json');
const MANIFEST_PATH = path.join(REPO_ROOT, 'wallets', 'manifest.json');
const DEVNET_URL = 'https://api.devnet.solana.com';

export type WorkflowTypeArg =
  | { recurringConditionalPayment: Record<string, never> }
  | { oneTimeApprovalGatedTransfer: Record<string, never> };

export interface PolicyEngineContext {
  program: Program<Ashlar>;
  owner: Keypair;
}

export async function loadPolicyEngineContext(): Promise<PolicyEngineContext> {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const secret = JSON.parse(readFileSync(WALLET_PATH, 'utf8')) as number[];
  const owner = Keypair.fromSecretKey(Uint8Array.from(secret));

  const connection = new Connection(DEVNET_URL, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(owner), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program(idl, provider) as Program<Ashlar>;

  return { program, owner };
}

/** The compiler's allowlist is currently just a string marker ("allowlisted"), not a real
 * pubkey; substitute the devnet test-vendor wallet as the stand-in recipient/allowlist entry
 * until a real vendor directory exists (Phase 5). */
export function resolveVendorPubkey(): PublicKey {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    wallets: { role: string; pubkey: string }[];
  };
  const vendorPubkeyStr = manifest.wallets.find((w) => w.role === 'test-vendor')?.pubkey;
  if (!vendorPubkeyStr) throw new Error('test-vendor wallet not found in wallets/manifest.json');
  return new PublicKey(vendorPubkeyStr);
}

export interface WorkflowPdas {
  workflow: PublicKey;
  ledger: PublicKey;
  attestationPda(stepIndex: number): PublicKey;
}

export function deriveWorkflowPdas(
  programId: PublicKey,
  owner: PublicKey,
  workflowId: anchor.BN,
): WorkflowPdas {
  const idBuf = workflowId.toArrayLike(Buffer, 'le', 8);

  const [workflow] = PublicKey.findProgramAddressSync(
    [Buffer.from('workflow'), owner.toBuffer(), idBuf],
    programId,
  );
  const [ledger] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), workflow.toBuffer()],
    programId,
  );
  function attestationPda(stepIndex: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('attestation'), workflow.toBuffer(), Buffer.from([stepIndex])],
      programId,
    );
    return pda;
  }

  return { workflow, ledger, attestationPda };
}

export function explorerLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export async function initializeWorkflow(
  ctx: PolicyEngineContext,
  args: {
    workflowId: anchor.BN;
    workflowType: WorkflowTypeArg;
    spendCap: anchor.BN;
    allowlist: PublicKey[];
  },
): Promise<{ signature: string; pdas: WorkflowPdas }> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, args.workflowId);
  const signature = await ctx.program.methods
    .initializeWorkflow(args.workflowId, args.workflowType, args.spendCap, args.allowlist)
    .accountsPartial({
      owner: ctx.owner.publicKey,
      workflow: pdas.workflow,
      ledger: pdas.ledger,
    })
    .rpc();
  return { signature, pdas };
}

export async function submitFetchStep(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  invoiceId: anchor.BN,
  amount: anchor.BN,
): Promise<string> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
  const workflow = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
  return ctx.program.methods
    .fetchStep(workflowId, invoiceId, amount)
    .accountsPartial({
      owner: ctx.owner.publicKey,
      workflow: pdas.workflow,
      attestation: pdas.attestationPda(workflow.currentStep),
      ledger: pdas.ledger,
    })
    .rpc();
}

/** Calls `compliance_check` or `manual_approval` on-chain depending on the workflow's own
 * stored type — the caller only supplies the semantic decision (`approved`), never picks the
 * instruction itself. */
export async function submitComplianceOrApprovalDecision(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  approved: boolean,
): Promise<string> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
  const workflow = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
  const accounts = {
    owner: ctx.owner.publicKey,
    workflow: pdas.workflow,
    attestation: pdas.attestationPda(workflow.currentStep),
    ledger: pdas.ledger,
  };

  if ('recurringConditionalPayment' in workflow.workflowType) {
    return ctx.program.methods.complianceCheck(workflowId, approved).accountsPartial(accounts).rpc();
  }
  return ctx.program.methods.manualApproval(workflowId, approved).accountsPartial(accounts).rpc();
}

export async function submitGuardrailCheck(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  amount: anchor.BN,
  recipient: PublicKey,
): Promise<string> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
  const workflow = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
  return ctx.program.methods
    .guardrailCheck(workflowId, amount, recipient)
    .accountsPartial({
      owner: ctx.owner.publicKey,
      workflow: pdas.workflow,
      attestation: pdas.attestationPda(workflow.currentStep),
      ledger: pdas.ledger,
    })
    .rpc();
}

/** `settlementReference` is the Squads execution tx signature (see squadsClient.completeSettlement)
 * — the real fund movement must already have happened before this is called; this instruction
 * only attests to it. */
export async function submitMockSettlement(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  settlementReference: string,
): Promise<string> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
  const workflow = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
  return ctx.program.methods
    .mockSettlement(workflowId, settlementReference)
    .accountsPartial({
      owner: ctx.owner.publicKey,
      workflow: pdas.workflow,
      attestation: pdas.attestationPda(workflow.currentStep),
      ledger: pdas.ledger,
    })
    .rpc();
}

/** Owner-only. Resumes a workflow paused in `PendingOverrideApproval` by amending the
 * guardrail step's own attestation/ledger entry — see resume_after_override.rs. */
export async function submitResumeAfterOverride(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  approved: boolean,
): Promise<string> {
  const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
  const workflow = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
  return ctx.program.methods
    .resumeAfterOverride(workflowId, approved)
    .accountsPartial({
      owner: ctx.owner.publicKey,
      workflow: pdas.workflow,
      attestation: pdas.attestationPda(workflow.currentStep),
      ledger: pdas.ledger,
    })
    .rpc();
}

export async function getWorkflow(ctx: PolicyEngineContext, workflow: PublicKey) {
  return ctx.program.account.workflowInstance.fetch(workflow);
}

export async function getLedger(ctx: PolicyEngineContext, ledger: PublicKey) {
  return ctx.program.account.ledger.fetch(ledger);
}
