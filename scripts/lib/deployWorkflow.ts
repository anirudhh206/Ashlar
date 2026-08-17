/**
 * Shared deploy sequence: compiles an English instruction with @ashlar/compiler and walks it
 * through all five real on-chain gates plus receipt minting. Extracted from
 * scripts/devnet/deploy-workflow.ts so both the CLI script and the dashboard relay's
 * authenticated POST /deploy endpoint call the exact same real logic, not two copies of it.
 *
 * `compileAndInitializeWorkflow` is the shared first half — compile + `initialize_workflow` only,
 * no decision about how the remaining gates get walked. `deployWorkflowFromInstruction` uses it
 * for the deterministic (owner-auto-approved) path; the dashboard relay's POST /agent/trigger
 * endpoint uses it too, then hands the rest off to the real live Claude agent loop
 * (agent/src/driveWorkflow.ts) instead — one real "compile + init" code path, two different real
 * ways of walking the rest of the gates.
 */
import * as anchor from '@anchor-lang/core';
import { PublicKey } from '@solana/web3.js';
import { compileInstruction } from '../../compiler/src/index.js';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  initializeWorkflow,
  submitFetchStep,
  submitComplianceOrApprovalDecision,
  submitGuardrailCheck,
  submitMockSettlement,
  getWorkflow,
  explorerLink,
  type PolicyEngineContext,
  type WorkflowTypeArg,
} from './policyEngineClient.js';
import { executeSplitSettlement } from './splitSettlement.js';
import { mintReceipt, buildReceiptNotification } from './receiptClient.js';
import { notifyOwner } from './notify.js';

export interface ExplicitRecipient {
  pubkey: PublicKey;
  amountUsd: number;
}

export interface CompileAndInitializeResult {
  compiledWorkflowType: string;
  ctx: PolicyEngineContext;
  vendor: PublicKey;
  recipients: ExplicitRecipient[];
  workflowId: anchor.BN;
  spendCapUsd: bigint;
  workflowPda: string;
  ledgerPda: string;
  initSignature: string;
}

export async function compileAndInitializeWorkflow(
  instruction: string,
  log: (message: string) => void = () => {},
  explicitRecipients: ExplicitRecipient[] = [],
): Promise<CompileAndInitializeResult> {
  const compiled = compileInstruction(instruction);
  log(`Instruction: "${instruction}"`);
  log(`Compiled as: ${compiled.workflowType}`);

  const ctx = await loadPolicyEngineContext();
  const vendor = resolveVendorPubkey();

  let workflowTypeArg: WorkflowTypeArg;
  if (compiled.workflowType === 'recurring-conditional-payment') {
    workflowTypeArg = { recurringConditionalPayment: {} };
  } else {
    workflowTypeArg = { oneTimeApprovalGatedTransfer: {} };
  }

  // Explicit recipients (real wallet addresses + amounts, entered by the operator rather than
  // parsed out of the instruction sentence) take over both the spend cap and the allowlist —
  // the sentence still has to satisfy the compiler's grammar to pick a template, but the money
  // actually moves against these real addresses, not whatever name the sentence happened to
  // contain. Falls back to the legacy single-vendor-stand-in path when none are given, so
  // existing CLI scripts and the deterministic /deploy flow are unaffected.
  const allowlist = explicitRecipients.length > 0 ? explicitRecipients.map((r) => r.pubkey) : [vendor];
  const spendCapUsd =
    explicitRecipients.length > 0
      ? BigInt(Math.round(explicitRecipients.reduce((sum, r) => sum + r.amountUsd, 0)))
      : compiled.workflowType === 'recurring-conditional-payment'
        ? BigInt(compiled.parameters.spendCap.perPayment)
        : BigInt(compiled.parameters.amount);

  const spendCap = new anchor.BN(spendCapUsd.toString());
  const workflowId = new anchor.BN(Date.now());

  const { signature: initSig, pdas } = await initializeWorkflow(ctx, {
    workflowId,
    workflowType: workflowTypeArg,
    spendCap,
    allowlist,
  });
  const workflowPda = pdas.workflow.toBase58();
  log(`Workflow PDA: ${workflowPda}`);
  log(
    explicitRecipients.length > 0
      ? `Recipients (allowlist): ${allowlist.map((a) => a.toBase58()).join(', ')}`
      : `Vendor (allowlist/recipient stand-in): ${vendor.toBase58()}`,
  );
  log(`[1/5] initialize_workflow: ${initSig}\n      ${explorerLink(initSig)}`);

  return {
    compiledWorkflowType: compiled.workflowType,
    ctx,
    vendor,
    recipients: explicitRecipients,
    workflowId,
    spendCapUsd,
    workflowPda,
    ledgerPda: pdas.ledger.toBase58(),
    initSignature: initSig,
  };
}

export interface DeployWorkflowHooks {
  /** Fired the moment the WorkflowInstance PDA exists (after step 1/5) — the earliest point a
   * caller can usefully react, well before the remaining ~4 transactions + receipt mint finish. */
  onInitialized?: (workflowPda: string) => void;
  log?: (message: string) => void;
}

export interface DeployWorkflowResult {
  instruction: string;
  workflowType: string;
  workflowPda: string;
  ledgerPda: string;
  receiptAssetId: string;
  receiptExplorerLink: string;
  finalStatus: unknown;
}

export async function deployWorkflowFromInstruction(
  instruction: string,
  hooks: DeployWorkflowHooks = {},
): Promise<DeployWorkflowResult> {
  const log = hooks.log ?? (() => {});
  const { compiledWorkflowType, ctx, vendor, workflowId, spendCapUsd, workflowPda, ledgerPda } =
    await compileAndInitializeWorkflow(instruction, log);
  hooks.onInitialized?.(workflowPda);

  const spendCap = new anchor.BN(spendCapUsd.toString());

  const fetchSig = await submitFetchStep(ctx, workflowId, new anchor.BN(1), spendCap);
  log(`[2/5] fetch_step: ${fetchSig}\n      ${explorerLink(fetchSig)}`);

  const decisionSig = await submitComplianceOrApprovalDecision(ctx, workflowId, true);
  const decisionLabel =
    compiledWorkflowType === 'recurring-conditional-payment' ? 'compliance_check' : 'manual_approval';
  log(`[3/5] ${decisionLabel}: ${decisionSig}\n      ${explorerLink(decisionSig)}`);

  const guardrailSig = await submitGuardrailCheck(ctx, workflowId, spendCap, vendor);
  log(`[4/5] guardrail_check: ${guardrailSig}\n      ${explorerLink(guardrailSig)}`);

  const { evidence, onChainReference } = await executeSplitSettlement(
    workflowId.toString(),
    Number(spendCapUsd),
    vendor,
  );
  log(
    `      Split settlement: vendor ${evidence.splits.vendorUsdcAtomic} / tax-reserve ` +
      `${evidence.splits.taxReserveUsdcAtomic} / yield-pool ${evidence.splits.yieldPoolUsdcAtomic} (USDC atomic units)`,
  );
  const settlementSig = await submitMockSettlement(ctx, workflowId, onChainReference);
  log(`[5/5] mock_settlement: ${settlementSig}\n      ${explorerLink(settlementSig)}`);

  const receipt = await mintReceipt(ctx.owner.secretKey, workflowId.toString(), evidence);
  log(`Receipt minted: ${receipt.assetId}\n      ${receipt.explorerLink}`);
  await notifyOwner(buildReceiptNotification(workflowId.toString(), receipt));

  const workflowAccount = await getWorkflow(ctx, new PublicKey(workflowPda));
  log(`Final status: ${JSON.stringify(workflowAccount.status)}`);

  return {
    instruction,
    workflowType: compiledWorkflowType,
    workflowPda,
    ledgerPda,
    receiptAssetId: receipt.assetId,
    receiptExplorerLink: receipt.explorerLink,
    finalStatus: workflowAccount.status,
  };
}
