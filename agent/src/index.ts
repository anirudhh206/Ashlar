/**
 * Phase 3 — AI Agent Reasoning Layer.
 *
 * Interprets live triggers and drives a compiled workflow from trigger to completion using a
 * Claude tool-use loop, explicitly stripped of signing authority: its output can only ever be
 * one of a handful of named, typed tool calls (see ./tools.ts) — never "construct and sign an
 * arbitrary transaction." All guardrail enforcement lives on-chain (programs/ashlar), not here;
 * this package's judgment is advisory only.
 */
export { driveWorkflow } from './driveWorkflow.js';
