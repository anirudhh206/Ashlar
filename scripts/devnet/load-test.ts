/**
 * Sustained heavy-load test against real devnet: ramps concurrency 5 -> 25 -> 50 -> 50 (two
 * waves at peak), mixing both workflow templates, the full $0-to-edge-of-overflow amount range
 * from Phase 5's stress pass, and a deliberate mix of should-reject (over-cap, non-allowlisted)
 * requests alongside legitimate ones in the same concurrent batch. Stops at guardrail_check —
 * real settlement needs devnet USDC funding, still pending (see README's Phase 5 status) — so
 * this exercises exactly the steps where accept/reject correctness is actually decided.
 *
 * Usage: pnpm load-test
 */
import * as anchor from '@anchor-lang/core';
import { PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  initializeWorkflow,
  submitFetchStep,
  submitComplianceOrApprovalDecision,
  submitGuardrailCheck,
  type PolicyEngineContext,
  type WorkflowTypeArg,
} from '../lib/policyEngineClient.js';

const STAGES = [5, 25, 50, 50];
const SPEND_CAP = 1000;
const MIN_SOL_BALANCE = 0.5; // stop early rather than risk running dry mid-batch

function loadAdversarialWallet(): PublicKey {
  const manifest = JSON.parse(readFileSync('wallets/manifest.json', 'utf8')) as {
    wallets: { role: string; pubkey: string }[];
  };
  const pubkey = manifest.wallets.find((w) => w.role === 'adversarial')?.pubkey;
  if (!pubkey) throw new Error('adversarial wallet not found in wallets/manifest.json');
  return new PublicKey(pubkey);
}

type WorkflowKind = 'legit' | 'over-cap' | 'non-allowlisted' | 'edge-max' | 'zero-amount';

function planWorkflow(index: number): { kind: WorkflowKind; spendCap: number; amount: number } {
  const bucket = index % 20;
  if (bucket < 3) return { kind: 'over-cap', spendCap: SPEND_CAP, amount: SPEND_CAP + 1 + (index % 1_000_000) };
  if (bucket < 6) return { kind: 'non-allowlisted', spendCap: SPEND_CAP, amount: 1 + (index % SPEND_CAP) };
  if (bucket === 6) return { kind: 'edge-max', spendCap: Number.MAX_SAFE_INTEGER, amount: Number.MAX_SAFE_INTEGER };
  if (bucket === 7) return { kind: 'zero-amount', spendCap: SPEND_CAP, amount: 0 };
  return { kind: 'legit', spendCap: SPEND_CAP, amount: 1 + (index % (SPEND_CAP - 1)) };
}

interface TxRecord {
  instruction: string;
  latencyMs: number;
  success: boolean;
  errorCategory?: '429' | 'other';
}

interface WorkflowResult {
  index: number;
  kind: WorkflowKind;
  workflowType: 'recurring' | 'one-time';
  workflowId: string;
  txs: TxRecord[];
  finalStatus?: string;
  expectedOutcome: 'passed' | 'pendingOverrideApproval' | 'rejected';
  outcomeCorrect: boolean;
  crashed?: string;
}

async function timed<T>(instruction: string, fn: () => Promise<T>): Promise<{ record: TxRecord; result?: T }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { record: { instruction, latencyMs: Date.now() - start, success: true }, result };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const errorCategory: TxRecord['errorCategory'] = /429|too many requests/i.test(message) ? '429' : 'other';
    return { record: { instruction, latencyMs: Date.now() - start, success: false, errorCategory } };
  }
}

async function runWorkflow(
  ctx: PolicyEngineContext,
  vendor: PublicKey,
  adversarial: PublicKey,
  index: number,
): Promise<WorkflowResult> {
  const plan = planWorkflow(index);
  const useRecurring = index % 2 === 0;
  const workflowType: 'recurring' | 'one-time' = useRecurring ? 'recurring' : 'one-time';
  const workflowTypeArg: WorkflowTypeArg = useRecurring
    ? { recurringConditionalPayment: {} }
    : { oneTimeApprovalGatedTransfer: {} };
  const recipient = plan.kind === 'non-allowlisted' ? adversarial : vendor;

  const expectedOutcome: WorkflowResult['expectedOutcome'] =
    plan.kind === 'over-cap' ? 'pendingOverrideApproval' : plan.kind === 'non-allowlisted' ? 'rejected' : 'passed';

  const txs: TxRecord[] = [];
  const workflowId = new anchor.BN(Date.now() + index + Math.floor(Math.random() * 1_000_000));
  const spendCapBN = new anchor.BN(plan.spendCap);
  const amountBN = new anchor.BN(plan.amount);

  try {
    const { pdas, record: initRecord } = await (async () => {
      const { record, result } = await timed('initialize_workflow', () =>
        initializeWorkflow(ctx, { workflowId, workflowType: workflowTypeArg, spendCap: spendCapBN, allowlist: [vendor] }),
      );
      return { pdas: result?.pdas, record };
    })();
    txs.push(initRecord);
    if (!pdas) throw new Error('initialize_workflow failed, aborting this workflow');

    const fetchTimed = await timed('fetch_step', () =>
      submitFetchStep(ctx, workflowId, new anchor.BN(index), amountBN),
    );
    txs.push(fetchTimed.record);

    const complianceTimed = await timed('compliance_or_approval', () =>
      submitComplianceOrApprovalDecision(ctx, workflowId, true),
    );
    txs.push(complianceTimed.record);

    const guardrailTimed = await timed('guardrail_check', () =>
      submitGuardrailCheck(ctx, workflowId, amountBN, recipient),
    );
    txs.push(guardrailTimed.record);

    const account = await ctx.program.account.workflowInstance.fetch(pdas.workflow);
    const finalStatus = Object.keys(account.status as object)[0] ?? 'unknown';
    const outcomeCorrect =
      (expectedOutcome === 'passed' && finalStatus === 'inProgress') ||
      (expectedOutcome === 'pendingOverrideApproval' && finalStatus === 'pendingOverrideApproval') ||
      (expectedOutcome === 'rejected' && finalStatus === 'rejected');

    return {
      index,
      kind: plan.kind,
      workflowType,
      workflowId: workflowId.toString(),
      txs,
      finalStatus,
      expectedOutcome,
      outcomeCorrect,
    };
  } catch (err) {
    return {
      index,
      kind: plan.kind,
      workflowType,
      workflowId: workflowId.toString(),
      txs,
      expectedOutcome,
      outcomeCorrect: false,
      crashed: (err as Error).message,
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function summarizeStage(stage: number, results: WorkflowResult[]) {
  const allTxs = results.flatMap((r) => r.txs);
  const byInstruction = new Map<string, TxRecord[]>();
  for (const tx of allTxs) {
    const list = byInstruction.get(tx.instruction) ?? [];
    list.push(tx);
    byInstruction.set(tx.instruction, list);
  }

  const perInstruction: Record<string, unknown> = {};
  for (const [instruction, txs] of byInstruction) {
    const latencies = txs.map((t) => t.latencyMs).sort((a, b) => a - b);
    const successCount = txs.filter((t) => t.success).length;
    const errors429 = txs.filter((t) => t.errorCategory === '429').length;
    perInstruction[instruction] = {
      count: txs.length,
      successRate: successCount / txs.length,
      errors429,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
    };
  }

  const correctCount = results.filter((r) => r.outcomeCorrect).length;
  const crashedCount = results.filter((r) => r.crashed).length;

  return {
    stage,
    concurrency: results.length,
    workflowsCorrect: correctCount,
    workflowsCrashed: crashedCount,
    correctnessRate: correctCount / results.length,
    perInstruction,
  };
}

async function main(): Promise<void> {
  const ctx = await loadPolicyEngineContext();
  const vendor = resolveVendorPubkey();
  const adversarial = loadAdversarialWallet();

  const logPath = path.join('treasury', 'load-test-log.json');
  const stageSummaries: unknown[] = [];
  let globalIndex = 0;

  for (const [stageNum, concurrency] of STAGES.entries()) {
    const balanceLamports = await ctx.program.provider.connection.getBalance(ctx.owner.publicKey);
    const balanceSol = balanceLamports / 1e9;
    console.log(`\n=== Stage ${stageNum + 1}/${STAGES.length}: ${concurrency} concurrent workflows (balance: ${balanceSol.toFixed(3)} SOL) ===`);
    if (balanceSol < MIN_SOL_BALANCE) {
      console.log(`Balance below ${MIN_SOL_BALANCE} SOL floor — stopping early.`);
      break;
    }

    const startIndex = globalIndex;
    const tasks = Array.from({ length: concurrency }, (_, i) => runWorkflow(ctx, vendor, adversarial, startIndex + i));
    globalIndex += concurrency;

    const stageStart = Date.now();
    const results = await Promise.all(tasks);
    const stageDurationMs = Date.now() - stageStart;

    const summary = { ...summarizeStage(stageNum + 1, results), stageDurationMs };
    console.log(JSON.stringify(summary, null, 2));
    stageSummaries.push(summary);

    const incorrect = results.filter((r) => !r.outcomeCorrect);
    if (incorrect.length > 0) {
      console.log(`\n!!! ${incorrect.length} workflow(s) had an INCORRECT outcome:`);
      for (const r of incorrect.slice(0, 10)) {
        console.log(`  workflow ${r.workflowId} (${r.kind}): expected ${r.expectedOutcome}, got ${r.finalStatus ?? r.crashed}`);
      }
    }
  }

  mkdirSync('treasury', { recursive: true });
  writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), stages: stageSummaries }, null, 2) + '\n');
  console.log(`\nWrote ${logPath}`);
}

main().catch((err: unknown) => {
  console.error('load-test crashed:', err);
  process.exit(1);
});
