# @ashlar/compiler

Turns a plain-English or structured instruction (e.g. *"pay every approved invoice every Friday"*)
into a fixed, ordered step sequence — the artifact that gets deployed to the on-chain Policy Engine.

Matches the instruction against a small set of workflow templates (recurring conditional payment,
one-time approval-gated transfer) rather than parsing fully open-ended language, and extracts
parameters: frequency, spend cap, allowlist, recipient rules.

**Status: not yet implemented (Phase 1).**
