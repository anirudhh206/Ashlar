/**
 * Run manually by the Business Owner to resolve a paused (over-cap) workflow. This is the
 * "manual signature" Phase 4's done-when criterion requires — the agent has no equivalent tool
 * and can never call this itself (see agent/src/driveWorkflow.ts).
 *
 * Usage: pnpm resume-workflow <workflowId> <approve|reject>
 */
import * as anchor from '@anchor-lang/core';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  deriveWorkflowPdas,
  getWorkflow,
  submitResumeAfterOverride,
  submitMockSettlement,
  explorerLink,
} from '../lib/policyEngineClient.js';
import { executeSplitSettlement } from '../lib/splitSettlement.js';
import { mintReceipt, buildReceiptNotification } from '../lib/receiptClient.js';
import { notifyOwner } from '../lib/notify.js';

async function main(): Promise<void> {
  const [workflowIdRaw, decisionRaw] = process.argv.slice(2);
  if (!workflowIdRaw || (decisionRaw !== 'approve' && decisionRaw !== 'reject')) {
    console.error('Usage: pnpm resume-workflow <workflowId> <approve|reject>');
    process.exit(1);
  }
  const approved = decisionRaw === 'approve';

  const ctx = await loadPolicyEngineContext();
  const workflowId = new anchor.BN(workflowIdRaw);
  const { workflow: workflowPda } = deriveWorkflowPdas(
    ctx.program.programId,
    ctx.owner.publicKey,
    workflowId,
  );

  const before = await getWorkflow(ctx, workflowPda);
  if (!('pendingOverrideApproval' in before.status)) {
    console.error(
      `Workflow ${workflowIdRaw} is not paused (status: ${JSON.stringify(before.status)}) — nothing to resume.`,
    );
    process.exit(1);
  }

  const resumeSig = await submitResumeAfterOverride(ctx, workflowId, approved);
  console.log(`resume_after_override(${String(approved)}): ${resumeSig}\n${explorerLink(resumeSig)}`);

  if (!approved) {
    console.log('Override declined — workflow stays Rejected.');
    return;
  }

  console.log('Override approved — completing settlement...');
  const recipient = resolveVendorPubkey();
  const { evidence, onChainReference } = await executeSplitSettlement(
    workflowIdRaw,
    before.pendingAmount.toNumber(),
    recipient,
  );
  console.log(`Split settlement: vendor ${evidence.splits.vendorUsdcAtomic} / tax-reserve ` +
    `${evidence.splits.taxReserveUsdcAtomic} / yield-pool ${evidence.splits.yieldPoolUsdcAtomic} (USDC atomic units)`);

  const settlementSig = await submitMockSettlement(ctx, workflowId, onChainReference);
  console.log(`mock_settlement: ${settlementSig}\n${explorerLink(settlementSig)}`);

  const receipt = await mintReceipt(ctx.owner.secretKey, workflowIdRaw, evidence);
  console.log(`Receipt minted: ${receipt.assetId}\n${receipt.explorerLink}`);
  await notifyOwner(buildReceiptNotification(workflowIdRaw, receipt));

  const after = await getWorkflow(ctx, workflowPda);
  console.log(`\nFinal status: ${JSON.stringify(after.status)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
