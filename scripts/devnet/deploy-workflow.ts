/**
 * Phase 2 bridge, CLI entrypoint: compiles an instruction with @ashlar/compiler and deploys it
 * as a WorkflowInstance on the on-chain Policy Engine, walking it through all five real gates.
 * The actual sequence lives in scripts/lib/deployWorkflow.ts, shared with the dashboard relay's
 * POST /deploy endpoint — this file is just argv parsing + console printing.
 *
 * Usage: pnpm deploy-workflow ["<instruction>"]
 */
import { deployWorkflowFromInstruction } from '../lib/deployWorkflow.js';

// The compiled amount is treated as a USD figure (the compiler already tags it `currency:
// 'USDC'`) and split 85/10/5 across vendor/tax-reserve/yield-pool via real Phase 5 rails — see
// scripts/lib/splitSettlement.ts. Keep this small; it's paid out in real devnet USDC.
const DEFAULT_INSTRUCTION = 'Transfer $5 to Acme Corp, pending my approval.';

async function main(): Promise<void> {
  const instruction = process.argv[2] ?? DEFAULT_INSTRUCTION;

  const result = await deployWorkflowFromInstruction(instruction, {
    log: (message) => console.log(message),
  });

  console.log(`\nWorkflow PDA: ${result.workflowPda}`);
  console.log(`Ledger PDA: ${result.ledgerPda}`);
  console.log(`\nFinal status: ${JSON.stringify(result.finalStatus)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
