# Honest Caveats

What's simplified, deferred, or not fully hardened — collected in one place so a presenter can
reference it or pre-empt the question, rather than the honesty being scattered across 9 phases'
worth of README prose. Nothing below contradicts what's claimed as real in `demo/one-pager.md`;
these are the boundaries of that realness.

## Network and scale

- **Everything runs on Solana devnet**, not mainnet. No claim is made about mainnet economics,
  liquidity, or gas cost at scale — only that the protocol logic and integrations are real, not
  simulated, at devnet scale.
- **Load-tested to ~50 concurrent workflows, not production scale.** The stress-test pass ramped
  5→25→50 concurrency with 100% correctness, but that's an evening's worth of real transactions,
  not a production traffic profile.
- **ZK compression (Light Protocol) was deliberately deferred**, same as Squads was deferred in an
  earlier phase — regular Anchor PDA accounts are used throughout. This affects state-storage cost
  at scale, not correctness.

## What's genuinely immutable vs. what's an honest limitation

- **The only boundary the on-chain program truly cannot be talked around is `guardrail_check`'s
  spend cap and allowlist.** `compliance_check`/`manual_approval` and `fetch_step` record whatever
  they're told — there is no independent invoice-authenticity check on-chain. This is by design and
  demonstrated deliberately (the `fabricated-invoice` adversarial scenario passes a made-up invoice
  id specifically to show the block comes from the allowlist boundary, not from any invoice
  verification the chain doesn't attempt).
- **The agent's tool executor is the trust boundary for `recipient`/`workflowId`**, not the model's
  output — the model supplies semantic arguments, but which workflow and (in the harness's binding)
  who gets paid is fixed by the calling code, never model-suppliable. This is verified, not just
  claimed, via the `unapproved-recipient` adversarial scenario.

## Settlement composition

- **Tax-reserve and yield-pool legs are placeholder devnet wallets**, not a real lending-protocol
  deposit or a real tax remittance — they receive genuine SPL token transfers, just not into any
  live external protocol.
- **The 85/10/5 split ratio is a fixed constant**, not owner-configurable yet.
- **AP2 mandate signing is implemented directly via `tweetnacl` ed25519 signing**, not the very-new
  `agentic-payments` reference npm package (which shipped too recently in this project's timeline
  to depend on with confidence) — the mandate itself is a real, verifiable signed artifact either
  way.
- **MPL Agent Registry was chosen over SAID Protocol** for agent identity — a narrower, more
  official fit for this use case, not a claim that SAID is worse in general.

## Custody

- **Squads multisig members (business-owner + treasury-placeholder) are both held locally** by the
  same operator for this devnet demo — architecturally identical to real multi-party custody (the
  Squads program itself doesn't know or care), but not actually multi-party in this environment.
- **Settlement funds move from the business-owner's own USDC-devnet balance**, separate from the
  Squads-held pooled lamport treasury that governs the pause/notify/resume-override flow — these
  are two intentionally different tracks (who authorizes a payout vs. how the payout itself moves
  funds), documented as a deliberate trade-off, not a gap.

## Verification scope

- **The verifier re-validates the most recent transaction touching each Attestation PDA** (at most
  2 ever exist per step index — the original call plus an optional `resume_after_override`
  amendment) — it does not replay every historical transaction ever sent to that PDA, only the one
  whose outcome the current account state reflects.
- **The dashboard relay holds the RPC/Helius key**; the browser never sees it — but the relay
  itself is a single trusted process in this demo, not a redundant/HA service.

## Hardening scope, stated plainly

- **Rate limiting on the trigger server is a basic in-memory, per-process sliding window** (20
  req/10s) — real but not distributed; a horizontally-scaled deployment would need a shared store.
- **Webhook-secret brute-forcing was tested as a volumetric flood with near-miss tokens, not
  exhaustive search** — a real 32-byte secret's keyspace (2^256) makes exhaustive brute force
  computationally meaningless to attempt, not something left untested by oversight.
- **Literal `u64::MAX` amounts were not tested** — `Number.MAX_SAFE_INTEGER` was used instead, to
  avoid conflating an unrelated JS-side floating-point edge case with the on-chain boundary
  actually under test.
- **Network-failure injection used real, available failure modes** (killing the local vendor
  server mid-flight, pointing a call at a deliberately unreachable RPC URL) rather than literally
  severing Helius's own network path, which isn't something controllable from this project.

## Notifications

- **Telegram delivery has not been exercised with real credentials in this environment** —
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` aren't configured here, so `scripts/lib/notify.ts` logs
  clearly to console instead of silently doing nothing. The HTTP call itself is real and would
  deliver given real credentials.
