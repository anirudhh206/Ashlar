/**
 * Phase 2 bridge: compiles an instruction with @ashlar/compiler, deploys it as a
 * WorkflowInstance on the on-chain Policy Engine, and manually walks it through all
 * four gates (fetch -> compliance/approval -> guardrail -> mock settlement) on devnet,
 * printing a tx signature at each step and the final Ledger contents.
 *
 * Usage: pnpm deploy-workflow ["<instruction>"]
 */
import * as anchor from '@anchor-lang/core';
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
  getLedger,
  explorerLink,
  type WorkflowTypeArg,
} from '../lib/policyEngineClient.js';
import { executeSplitSettlement } from '../lib/splitSettlement.js';

// The compiled amount is treated as a USD figure (the compiler already tags it `currency:
// 'USDC'`) and split 85/10/5 across vendor/tax-reserve/yield-pool via real Phase 5 rails — see
// scripts/lib/splitSettlement.ts. Keep this small; it's paid out in real devnet USDC.
const DEFAULT_INSTRUCTION = 'Transfer $5 to Acme Corp, pending my approval.';

async function main(): Promise<void> {
  const instruction = process.argv[2] ?? DEFAULT_INSTRUCTION;
  const compiled = compileInstruction(instruction);
  console.log(`Instruction: "${instruction}"`);
  console.log(`Compiled as: ${compiled.workflowType}`);

  const ctx = await loadPolicyEngineContext();
  const vendor = resolveVendorPubkey();

  let spendCapUsd: bigint;
  let workflowTypeArg: WorkflowTypeArg;
  if (compiled.workflowType === 'recurring-conditional-payment') {
    spendCapUsd = BigInt(compiled.parameters.spendCap.perPayment);
    workflowTypeArg = { recurringConditionalPayment: {} };
  } else {
    spendCapUsd = BigInt(compiled.parameters.amount);
    workflowTypeArg = { oneTimeApprovalGatedTransfer: {} };
  }
  const spendCap = new anchor.BN(spendCapUsd.toString());
  const workflowId = new anchor.BN(Date.now());

  const { signature: initSig, pdas } = await initializeWorkflow(ctx, {
    workflowId,
    workflowType: workflowTypeArg,
    spendCap,
    allowlist: [vendor],
  });
  console.log(`\nWorkflow PDA: ${pdas.workflow.toBase58()}`);
  console.log(`Vendor (allowlist/recipient stand-in): ${vendor.toBase58()}`);
  console.log(`\n[1/5] initialize_workflow: ${initSig}\n      ${explorerLink(initSig)}`);

  const fetchSig = await submitFetchStep(ctx, workflowId, new anchor.BN(1), spendCap);
  console.log(`[2/5] fetch_step: ${fetchSig}\n      ${explorerLink(fetchSig)}`);

  const decisionSig = await submitComplianceOrApprovalDecision(ctx, workflowId, true);
  const decisionLabel =
    compiled.workflowType === 'recurring-conditional-payment' ? 'compliance_check' : 'manual_approval';
  console.log(`[3/5] ${decisionLabel}: ${decisionSig}\n      ${explorerLink(decisionSig)}`);

  const guardrailSig = await submitGuardrailCheck(ctx, workflowId, spendCap, vendor);
  console.log(`[4/5] guardrail_check: ${guardrailSig}\n      ${explorerLink(guardrailSig)}`);

  const { evidence, onChainReference } = await executeSplitSettlement(
    workflowId.toString(),
    Number(spendCapUsd),
    vendor,
  );
  console.log(`      Split settlement: vendor ${evidence.splits.vendorUsdcAtomic} / tax-reserve ` +
    `${evidence.splits.taxReserveUsdcAtomic} / yield-pool ${evidence.splits.yieldPoolUsdcAtomic} (USDC atomic units)`);
  const settlementSig = await submitMockSettlement(ctx, workflowId, onChainReference);
  console.log(`[5/5] mock_settlement: ${settlementSig}\n      ${explorerLink(settlementSig)}`);

  const workflowAccount = await getWorkflow(ctx, pdas.workflow);
  const ledgerAccount = await getLedger(ctx, pdas.ledger);
  console.log(`\nFinal status: ${JSON.stringify(workflowAccount.status)}`);
  console.log(`Ledger (${ledgerAccount.entries.length} entries):`);
  console.log(JSON.stringify(ledgerAccount.entries, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
