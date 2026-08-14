# @ashlar/verifier

The payoff: proof anyone can check without trusting Ashlar. A standalone, minimal tool (CLI or
simple web page) that takes a workflow ID, queries the Ledger and Attestation Registry directly
via RPC, and independently re-validates every step's signature — with zero authentication against
Ashlar's own systems.

Deliberately kept separate from `agent/` and `compiler/`: it must be runnable by someone with no
prior access to the codebase and get a correct pass/fail with no help from the project team.

**Status: not yet implemented (Phase 6).**
