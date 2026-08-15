# @ashlar/verifier

The payoff: proof anyone can check without trusting Ashlar. A standalone CLI that takes a
workflow's on-chain address, queries the Accounting Ledger and Step Attestation Registry directly
via RPC, and independently re-validates every step — with zero authentication against Ashlar's own
systems.

Deliberately kept separate from `agent/`, `scripts/lib/`, and `compiler/`: it never imports the
app's own client code, only the public Anchor IDL and third-party libraries
(`@solana/web3.js`, `@anchor-lang/core`). It re-derives every PDA and re-reads every account
itself, so it must be runnable by someone with no prior access to the codebase and get a correct
pass/fail with no help from the project team.

## What "re-validates every step" actually means

`Attestation.data_hash` is a keccak256 hash of each step's raw instruction data — the raw data
itself is **not** stored on-chain (see `programs/ashlar/src/instructions/shared.rs`). For two of
the five step kinds (`fetch_step`, `mock_settlement`), that raw data doesn't exist anywhere in
final account state either — only in the original transaction. So for every attested step, the
verifier:

1. Finds the actual transaction that produced (or, for a resumed guardrail step, later amended)
   that step's `Attestation` account via `getSignaturesForAddress`/`getTransaction`.
2. Decodes its real instruction arguments through the Anchor IDL.
3. Confirms the workflow's `owner` is among that transaction's signers (Solana's own consensus
   already verified the actual ed25519 signature before confirming the transaction — the verifier
   confirms the *right party* signed, not the cryptography itself).
4. Rebuilds the exact byte preimage each instruction hashes and recomputes the keccak256 digest,
   comparing it against `Attestation.data_hash`.

A workflow that paused and was later resumed (`resume_after_override`) is handled correctly: the
verifier follows whichever transaction most recently touched that step's attestation, decodes
whatever instruction it actually turns out to be, and rebuilds the matching preimage — not an
assumed step-kind-to-instruction mapping.

## Usage

```powershell
pnpm verify <workflowPdaAddress>
# or
pnpm verify --owner <ownerPubkey> --id <workflowId>
```

Exits `0` only on a complete pass (structural checks + every step's signer and hash
re-validated), non-zero otherwise — usable in scripts as well as by hand. Prints a full
per-step breakdown including each transaction's Explorer link.

## Status: implemented (Phase 6)

CLI now; the core (`verifyWorkflow`, `VerificationReport`) is exported from `src/index.ts` so a
future web frontend can reuse it directly without rework.
