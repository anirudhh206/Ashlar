/**
 * Phase 6 — Verification Layer.
 *
 * A standalone, minimal tool (CLI or simple web page) that takes a workflow
 * ID, queries the Accounting Ledger and Step Attestation Registry directly
 * via RPC, and independently re-validates every signature — with zero
 * authentication against Ashlar's own systems. Anyone can run this against a
 * live workflow and get a correct pass/fail with no help from the project.
 *
 * Status: not yet implemented (Phase 6).
 */
export function verifyWorkflow(_workflowId: string): never {
  throw new Error('verifyWorkflow is not yet implemented (Phase 6)');
}
