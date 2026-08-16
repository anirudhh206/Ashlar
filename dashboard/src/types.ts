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

export interface WorkflowSnapshot {
  workflow: {
    workflowId: string;
    owner: string;
    workflowType: string;
    status: string;
    currentStep: number;
    spendCap: string;
    pendingAmount: string;
    pendingRecipient: string;
  };
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

export interface SettlementEvidence {
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

export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString();
}

export interface Receipt {
  assetId: string;
  workflowId: string | null;
  name: string;
  jsonUri: string | null;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
