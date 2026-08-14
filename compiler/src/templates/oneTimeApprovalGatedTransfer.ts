import type { OneTimeApprovalGatedTransferParams, Step, WorkflowTemplate } from '../types.js';

const APPROVAL_CUE = /\b(pending|requires?|subject to)\s+(my\s+)?approval\b/i;
const TRANSFER_CUE = /\b(transfer|send|pay)\b/i;
const AMOUNT_AND_RECIPIENT_RE = /\$?(\d+(?:\.\d+)?)\s+to\s+([A-Za-z][\w&.'\- ]*?)(?:,|\.|$)/i;

function extractParams(instruction: string): OneTimeApprovalGatedTransferParams {
  const match = AMOUNT_AND_RECIPIENT_RE.exec(instruction);
  if (!match) {
    throw new Error(
      `one-time-approval-gated-transfer: could not find an "<amount> to <recipient>" cue in: "${instruction}"`,
    );
  }

  return {
    amount: Number(match[1]),
    recipient: match[2]!.trim(),
    currency: 'USDC',
    requiresApproval: true,
  };
}

function buildSteps(params: OneTimeApprovalGatedTransferParams): Step[] {
  return [
    { kind: 'fetch', params: { source: 'manual' } },
    { kind: 'manual_approval', params: { approver: 'business-owner' } },
    { kind: 'guardrail_check', params: { allowlist: params.recipient } },
    {
      kind: 'settlement',
      params: { recipient: params.recipient, amount: params.amount, currency: params.currency },
    },
    { kind: 'attestation' },
    { kind: 'ledger_write' },
  ];
}

export const oneTimeApprovalGatedTransfer: WorkflowTemplate<
  'one-time-approval-gated-transfer',
  OneTimeApprovalGatedTransferParams
> = {
  id: 'one-time-approval-gated-transfer',
  match(instruction: string): boolean {
    return APPROVAL_CUE.test(instruction) && TRANSFER_CUE.test(instruction);
  },
  extractParams,
  buildSteps,
};
