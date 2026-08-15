/**
 * pnpm verify <workflowPdaAddress>
 * pnpm verify --owner <ownerPubkey> --id <workflowId>
 *
 * Prints a full independent verification report and exits 0 only on a complete pass (structural
 * checks + every step's signer/hash re-validated), non-zero otherwise — usable in scripts/CI as
 * well as by hand.
 */
import { PublicKey } from '@solana/web3.js';
import { loadChainClient, deriveWorkflowPdas } from './chainClient.js';
import { verifyWorkflow, type VerificationReport } from './verifyWorkflow.js';

function parseArgs(argv: string[]): { workflow?: string; owner?: string; id?: string } {
  const result: { workflow?: string; owner?: string; id?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--owner') {
      const value = argv[++i];
      if (value) result.owner = value;
    } else if (arg === '--id') {
      const value = argv[++i];
      if (value) result.id = value;
    } else if (arg && !arg.startsWith('--')) {
      result.workflow = arg;
    }
  }
  return result;
}

function printReport(report: VerificationReport): void {
  console.log(`\nWorkflow:     ${report.workflow}`);
  console.log(`Owner:        ${report.owner}`);
  console.log(`Type:         ${report.workflowType}`);
  console.log(`Status:       ${report.status}`);
  console.log(`Current step: ${report.currentStep}`);

  if (!report.structuralChecksPassed) {
    console.log(`\nStructural issues:`);
    for (const issue of report.structuralIssues) console.log(`  - ${issue}`);
  }

  console.log(`\nSteps (${report.steps.length}):`);
  for (const step of report.steps) {
    const mark = step.signerVerified && step.hashVerified ? 'PASS' : 'FAIL';
    console.log(
      `  [${mark}] step ${step.stepIndex} ${step.attestedStepKind} (${step.outcome}) via ${step.decodedInstruction || '?'}`,
    );
    console.log(`         tx: ${step.signature || '(none)'}`);
    if (step.explorerLink) console.log(`         ${step.explorerLink}`);
    console.log(`         signer verified: ${step.signerVerified}, hash verified: ${step.hashVerified}`);
    if (step.detail) console.log(`         detail: ${step.detail}`);
  }

  console.log(`\nOVERALL: ${report.overallPass ? 'PASS' : 'FAIL'}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = loadChainClient();

  let workflowPubkey: PublicKey;
  if (args.workflow) {
    workflowPubkey = new PublicKey(args.workflow);
  } else if (args.owner && args.id) {
    const pdas = deriveWorkflowPdas(client.programId, new PublicKey(args.owner), BigInt(args.id));
    workflowPubkey = pdas.workflow;
  } else {
    console.error('Usage: pnpm verify <workflowPdaAddress>');
    console.error('   or: pnpm verify --owner <ownerPubkey> --id <workflowId>');
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = await verifyWorkflow(client, workflowPubkey);
  } catch (err) {
    console.log(`\nWorkflow:     ${workflowPubkey.toBase58()}`);
    console.log(`\nOVERALL: FAIL — could not load this account as a WorkflowInstance`);
    console.log(`  reason: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }
  printReport(report);
  process.exitCode = report.overallPass ? 0 : 1;
}

// process.exitCode (not process.exit()) lets Node drain pending async handles from
// @solana/web3.js's Connection naturally — calling process.exit() immediately after an RPC call
// races a pending internal handle and crashes with a libuv assertion on Windows, corrupting the
// real exit code (confirmed: observed exit 127 instead of the intended 1).
main().catch((err: unknown) => {
  console.error('verifier crashed:', err);
  process.exitCode = 1;
});
