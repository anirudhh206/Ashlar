// Only ever talks to the relay's own endpoints — never Helius, never holds an API key. See
// dashboard/server/relay.ts.
export const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://localhost:8789';
export const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? 'http://localhost:5174';

export interface LedgerEntry {
  stepIndex: number;
  stepKind: string;
  outcome: string;
  timestamp: number;
}

// Matches dashboard/server/relay.ts's summarizeWorkflowAccount exactly — the real, on-chain
// fields a WorkflowInstance account actually has. No instruction text, no cadence/trigger: those
// aren't stored on-chain and aren't shown anywhere in this app.
export interface WorkflowSummary {
  pda: string;
  workflowId: string;
  owner: string;
  workflowType: string;
  status: string;
  currentStep: number;
  spendCap: string;
  pendingAmount: string;
  pendingRecipient: string;
}

export interface WorkflowsListResponse {
  total: number;
  items: WorkflowSummary[];
}

export interface WorkflowSnapshot {
  workflow: WorkflowSummary;
  ledger: { entries: LedgerEntry[] };
}

export interface AttestationEvent {
  type: 'attestation';
  workflow: string;
  stepIndex: number;
  stepKind: string;
  outcome: string;
  executedBy: string;
  timestamp: number;
}

// The legacy vendor-split path (scripts/lib/splitSettlement.ts) — a single vendor paid via real
// x402 rails, plus a tax-reserve/yield-pool skim. Old evidence files on disk predate the `kind`
// discriminator entirely, so it's optional here and treated as this shape when absent.
export interface VendorSplitSettlementEvidence {
  kind?: 'vendor-split-settlement';
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  splits: {
    vendorUsdcAtomic: string;
    taxReserveUsdcAtomic: string;
    yieldPoolUsdcAtomic: string;
  };
  vendorPayment: { invoiceUrl: string; status: number };
  taxReserveTransferSignature: string;
  yieldPoolTransferSignature: string;
  ap2Mandate: { signature: string; verified: boolean };
  agentIdentity: { registered: boolean; assetAddress: string };
}

// A direct multi-recipient transfer (scripts/lib/directTransfer.ts) — real wallet addresses
// named explicitly by the operator, paid in full with no automatic skim.
export interface DirectTransferEvidence {
  kind: 'direct-transfer';
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  legs: { recipient: string; amountUsd: number; usdcAtomic: string; signature: string }[];
}

export type SettlementEvidence = VendorSplitSettlementEvidence | DirectTransferEvidence;

export interface Receipt {
  assetId: string;
  workflowId: string | null;
  name: string;
  jsonUri: string | null;
}

export interface MockInvoice {
  id: number;
  amount: number;
  vendor: string;
  status: 'approved' | 'pending';
}

// Mirrors agent/src/driveWorkflow.ts's real AgentEvent union exactly — every real thing the live
// Claude tool-use loop can do, nothing invented on the frontend side.
export type AgentEvent =
  | { type: 'trigger'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'paused'; pendingAmount: string; spendCap: string }
  | { type: 'finished'; status: string }
  | { type: 'max_turns' }
  | { type: 'error'; message: string };

export interface AgentEventMessage {
  type: 'agent';
  workflow: string;
  event: AgentEvent;
}

export type RelaySseEvent = AttestationEvent | AgentEventMessage;

// Mirrors verifier/src/verifyWorkflow.ts's real types exactly — this is the actual report shape
// POST /verify returns, not a UI-invented summary.
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

export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

// Workflow ids are Date.now()-based (see scripts/lib/deployWorkflow.ts) — the only real
// "created at" timestamp a workflow has, since nothing stores one explicitly on-chain.
export function workflowIdToDate(workflowId: string): Date {
  return new Date(Number(workflowId));
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
