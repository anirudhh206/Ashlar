/**
 * Phase 6 — Verification Layer.
 *
 * A standalone, minimal tool that takes a workflow's on-chain address, queries the Accounting
 * Ledger and Step Attestation Registry directly via RPC, and independently re-validates every
 * step — with zero authentication against Ashlar's own systems and no dependency on Ashlar's
 * own client code (see chainClient.ts). Anyone can run this against a live workflow and get a
 * correct pass/fail with no help from the project.
 *
 * CLI now (see cli.ts, `pnpm verify`); a web frontend can reuse this same core later.
 */
export { loadChainClient, deriveWorkflowPdas, explorerLink, type ChainClient } from './chainClient.js';
export { verifyWorkflow, type VerificationReport, type StepVerification } from './verifyWorkflow.js';
