/**
 * Phase 3 — AI Agent Reasoning Layer.
 *
 * Interprets live triggers and instructions, integrating Solana Agent Kit to
 * call real on-chain actions (read invoice data, call the Policy Engine's
 * next-step instruction). Explicitly stripped of signing authority: its
 * output can only ever be "call the next compiled instruction" — never
 * "construct and sign an arbitrary transaction." This is the design choice
 * that makes the security story true, not just claimed.
 *
 * Status: not yet implemented (Phase 3).
 */
export function driveWorkflow(_workflowId: string): never {
  throw new Error('driveWorkflow is not yet implemented (Phase 3)');
}
