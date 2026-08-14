# @ashlar/agent

The AI reasoning layer that interprets live triggers and drives a compiled workflow from trigger
to completion, using Solana Agent Kit to call real on-chain actions.

**Explicitly stripped of signing authority.** Its output can only ever be "call the next compiled
instruction on the Policy Engine" — never "construct and sign an arbitrary transaction." All
guardrail enforcement lives on-chain (`programs/ashlar`), not here; this package's judgment is
advisory only.

**Status: not yet implemented (Phase 3).**
