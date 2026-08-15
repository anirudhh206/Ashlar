/**
 * Phase 3 demo/verification script — initializes a fresh workflow on devnet, then hands it to
 * the real agent (a Claude tool-use loop, see agent/src/driveWorkflow.ts) to drive to
 * completion. Requires ANTHROPIC_API_KEY (see .env.example).
 *
 * Usage: pnpm agent-demo ["<instruction>"] [invoiceId]
 */
import * as anchor from '@anchor-lang/core';
import { compileInstruction } from '../../compiler/src/index.js';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  initializeWorkflow,
  explorerLink,
  type WorkflowTypeArg,
} from '../lib/policyEngineClient.js';
import { driveWorkflow } from '../../agent/src/driveWorkflow.js';

// Small USD amount matching agent/src/mockInvoices.ts's invoice #1 exactly (Phase 5 changed the
// compiled amount's unit from mock lamports to real USD — this default was stale until now).
const DEFAULT_INSTRUCTION = 'Transfer $5 to Acme Corp, pending my approval.';
const DEFAULT_INVOICE_ID = 1;

async function main(): Promise<void> {
  const instruction = process.argv[2] ?? DEFAULT_INSTRUCTION;
  const invoiceId = Number(process.argv[3] ?? DEFAULT_INVOICE_ID);

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

  const { signature, pdas } = await initializeWorkflow(ctx, {
    workflowId,
    workflowType: workflowTypeArg,
    spendCap,
    allowlist: [vendor],
  });
  console.log(`\nWorkflow PDA: ${pdas.workflow.toBase58()}`);
  console.log(`initialize_workflow: ${signature}\n${explorerLink(signature)}`);
  console.log(`\nHanding off to the agent for invoice ${invoiceId}...\n`);

  await driveWorkflow(workflowId.toString(), invoiceId);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
