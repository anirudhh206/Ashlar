# Ashlar

**A programmable financial workflow engine for AI agents on Solana — where the agent decides, but
the chain enforces.**

## The problem

Letting an AI agent handle recurring payments, approvals, or treasury actions means trusting a
non-deterministic model with real money. Today that trust is usually implicit: the agent's output
*is* the transaction. If it hallucinates, gets prompt-injected, or is simply compromised, nothing
stops it — the model's judgment and its signing authority are the same thing.

## The solution

Ashlar compiles a plain-English instruction into a fixed, on-chain gate sequence — fetch,
compliance/approval, guardrail (spend cap + allowlist), settlement — enforced by an immutable
Solana program. An AI agent (Claude, real tool-use, real API) drives the workflow forward by
calling one of exactly 4 narrow, typed tools. It can request the next step. **It cannot construct a
transaction, override a guardrail, or move funds outside the owner-set boundaries — because that
capability was never given to it**, not because a filter is checking its output after the fact.
Every step writes a signed, hashed attestation; anyone — with no login, no trust in Ashlar's own
code — can independently re-verify the entire proof chain against Solana's own transaction history.

## Architecture in three sentences

A deterministic compiler turns English into a `CompiledWorkflow`. An Anchor program on Solana
devnet enforces that compiled step sequence in order, gating every state transition on-chain, with
real settlement rails underneath (x402/PayAI for vendor payment, Pyth for live pricing, AP2 for
signed payment mandates, Squads for multisig treasury custody). A standalone verifier and live
dashboard — sharing zero code with the app — independently re-validate every attested step by
re-fetching and re-decoding the actual transactions.

See `demo/architecture-diagram.md` for the full system diagram.

## What's real (not a mockup, not a simulation)

- **Two structurally different compiled workflow types**, same engine, same on-chain program:
  - `one-time-approval-gated-transfer` — completed real settlement:
    [`BLNk3YKYy65FQKoBwRR2xQgytZ2ZZ99Phwp6A6ZqEjJr`](https://explorer.solana.com/address/BLNk3YKYy65FQKoBwRR2xQgytZ2ZZ99Phwp6A6ZqEjJr?cluster=devnet)
  - `recurring-conditional-payment` — completed real settlement:
    [`43u2XzFUb2yB32Sd83Qad6d8Sz51L4m5z7Tvc6pVoXN8`](https://explorer.solana.com/address/43u2XzFUb2yB32Sd83Qad6d8Sz51L4m5z7Tvc6pVoXN8?cluster=devnet)
- **A real x402 vendor payment**, settled through PayAI's live public facilitator, real signed
  USDC transfer:
  [`yvbUcYbeGEmENAveeDs1Sveqp2UjMUGN6hhf3XuRDcGHysGdLdiHCfyQ5y6iaCav886AAreXobXyGkxtfz244La`](https://explorer.solana.com/tx/yvbUcYbeGEmENAveeDs1Sveqp2UjMUGN6hhf3XuRDcGHysGdLdiHCfyQ5y6iaCav886AAreXobXyGkxtfz244La?cluster=devnet)
- **A real compressed NFT receipt**, minted into the owner's wallet, metadata on permanent Arweave
  storage:
  [`CpxvZzxFdb4u7JGiZtHokW4Uerbzcyi1cX5xCqK5ER5d`](https://explorer.solana.com/address/CpxvZzxFdb4u7JGiZtHokW4Uerbzcyi1cX5xCqK5ER5d?cluster=devnet)
- **Independent verification, run for real** — `pnpm verify <workflowPda>` against both completed
  workflows above returns a full `PASS`: every attested step's signer and data hash re-derived from
  Solana's own transaction history, zero trust in Ashlar's own client code.
- **A real adversarial hardening pass** — deterministic and live-Claude-agent injection attempts
  (oversized payment, unapproved recipient, fabricated invoice, spend-cap/allowlist/compliance
  prompt injection) all correctly blocked on-chain, logged in `treasury/adversarial-log.json`, plus
  a heavier stress/security pass (replay, TOCTOU race, AP2 fuzzing, negative-amount fuzzing,
  webhook flood) that found and fixed 4 real bugs.
- **A live public dashboard** streaming attestation events over Server-Sent Events, with the RPC
  key held only by a small relay the browser never talks to directly.

## What's honestly simplified for a devnet demo

See `demo/honest-caveats.md` — collected in one place rather than scattered across phase writeups,
so nothing here is presented as more finished than it is.
