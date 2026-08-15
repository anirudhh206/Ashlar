# Ashlar

A programmable financial workflow engine for AI agents on Solana. A business owner types one
plain-English instruction — *"pay every approved invoice every Friday"* — and it becomes a fixed,
on-chain program that runs that process automatically, without needing to trust an AI agent's
judgment in the moment.

## How it works

1. A **compiler** turns the instruction into a fixed on-chain program — not something an AI can
   improvise around later.
2. An **AI Agent Reasoning Layer** interprets live triggers and instructions, but is explicitly
   stripped of signing authority — its judgment is advisory only.
3. An **on-chain Solana engine** enforces hard-coded guardrails (spend caps, allowlists), executes
   settlement through existing rails (x402), and writes a signed attestation at every step using
   Light Protocol's ZK Compression to keep costs near zero.
4. An **independent verifier** — a standalone tool anyone can run — checks that proof chain
   directly against the ledger, with no login and no trust required in the company's database.

See [`implementation_roadmap.md`](./implementation_roadmap.md) for the full 10-phase build plan.

## Repo layout

| Path         | Purpose                                                              |
|--------------|-----------------------------------------------------------------------|
| `programs/`  | Anchor (Rust) on-chain programs                                       |
| `compiler/`  | Instruction → compiled step sequence                                  |
| `agent/`     | AI reasoning layer (no signing authority)                             |
| `verifier/`  | Standalone proof-chain verification tool                              |
| `dashboard/` | Live public dashboard                                                 |
| `scripts/`   | Devnet setup and verification scripts                                 |
| `wallets/`   | Devnet keypairs (gitignored) + `manifest.json` (pubkeys/roles, tracked) |

## Dev environment

This repo is built across two environments on the same checkout:

- **WSL2 (Ubuntu)** is canonical for Rust/Anchor — building, testing, running a local validator,
  and deploying. Run these from WSL2 at `/mnt/d/Ashlar`.
- **Windows native** is canonical for TypeScript — the `compiler/`, `agent/`, `verifier/`, and
  `dashboard/` packages, plus the devnet scripts under `scripts/`. Uses the Node/pnpm already on
  Windows.

### One-time setup

**Windows — Solana CLI (fallback only, not used for build/deploy):**
The Windows-side Solana CLI install can end up with a broken `active_release` link. Fix with:
```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.local\share\solana\install\active_release" -Target "$env:USERPROFILE\.local\share\solana\install\releases\<version>\solana-release"
```
Verify in a **new** shell with `solana --version`.

**WSL2 — Rust/Anchor toolchain:**
Requires `solana-cli`, `anchor-cli` (via `avm`), and `rustc`/`cargo` already configured for devnet
(`~/.config/solana/cli/config.yml`). No setup needed if these are already installed.

**Windows — Node/pnpm:**
```powershell
pnpm install
```

### External accounts (human action items — not automatable)

- **Helius** — sign up at https://dashboard.helius.dev, generate a devnet API key. Covers RPC,
  webhooks, and the ZK-compression-aware endpoint (used instead of a separately hosted Light
  Protocol / Photon indexer).
- **Squads** — deferred to Phase 4 (treasury multisig). Nothing to do yet.
- **Pyth** — no signup needed to read public devnet price accounts.

Copy `.env.example` to `.env` and fill in the values above.

### Devnet wallets

```powershell
pnpm generate-wallets
```
Generates four keypairs into `wallets/` (gitignored) and writes `wallets/manifest.json` (pubkeys
and roles only — never private keys):

| Role                  | Purpose                                                        |
|-----------------------|------------------------------------------------------------------|
| `business-owner`      | The workflow-initiating identity                                 |
| `treasury-placeholder`| Stand-in for the eventual Squads multisig vault (real one: Phase 4) |
| `test-vendor`         | Receiving/counterparty wallet for invoice-payment tests           |
| `adversarial`         | Phase 8's "try to break it" wallet                                |
| `tax-reserve-placeholder` | Split-settlement destination, tax-reserve leg (Phase 5)       |
| `yield-pool-placeholder`  | Split-settlement destination, yield-pool leg — not a real lending-protocol deposit (Phase 5) |
| `agent-identity`      | Registered on-chain via MPL Agent Registry as the agent's identity (Phase 5) |

If the devnet faucet airdrop is rate-limited, fund a wallet manually:
```
solana airdrop 2 <pubkey> --url devnet
```

### Build and deploy the hello-world program (WSL2)

```bash
cd /mnt/d/Ashlar
anchor build
anchor deploy --provider.cluster devnet
```

Program ID: `7AESNgNKweEEveyb4vnuTpKALzjDhupFauAfgSc97z7t` (also set in `Anchor.toml`
`[programs.devnet]`).

### Call it (Windows)

```powershell
pnpm hello-world
```
Prints the transaction signature and a devnet Explorer link.

## Phase 0 status

- [x] Repo scaffolded
- [x] Devnet wallets generated
- [x] Hello-world program deployed to devnet and called successfully

## Phase 1 status

- [x] Compiler templates defined: `recurring-conditional-payment`, `one-time-approval-gated-transfer`
- [x] Rule-based parser extracts parameters and produces a fixed step sequence per template
- [x] Two different instructions produce two differently-structured step sequences (`pnpm test:compiler`)

## Phase 2 status

- [x] Policy Engine instructions: `initialize_workflow`, `fetch_step`, `compliance_check`,
      `manual_approval`, `guardrail_check`, `mock_settlement` — enforce the compiled step
      sequence in order, reject out-of-order calls
- [x] Step Attestation Registry: one `Attestation` PDA per step (regular Anchor PDAs for now —
      real Light Protocol ZK Compression deferred, see below)
- [x] Accounting Ledger: one append-only `Ledger` PDA per workflow, readable as a single account
- [x] `tests/policy-engine.ts` — happy path for both workflow types, guardrail rejection, approval
      rejection, out-of-order rejection (`pnpm test:anchor`, run from WSL via `anchor test`)
- [x] `scripts/devnet/deploy-workflow.ts` bridges `@ashlar/compiler` output into a real on-chain
      workflow and walks it through all 4 gates on devnet (`pnpm deploy-workflow ["<instruction>"]`)

**Deferred:** the Attestation Registry and Ledger use regular rent-paying Anchor PDA accounts, not
Light Protocol's ZK Compression. Compression is a materially larger integration (light-sdk on the
program side, stateless.js + a compression-aware indexer on the client side) with no existing
integration in this repo; deferred to a later hardening pass. Settlement amounts are lamports
standing in for a stablecoin unit — real x402/stablecoin settlement is Phase 5. (Phase 2 originally
settled via a simple per-workflow vault PDA; Phase 4 replaced that with a real pooled Squads
treasury — see below.)

## Phase 3 status

- [x] Tool-calling harness (`agent/src/tools.ts`): 5 Claude tool schemas, one read-only invoice
      lookup + four wrappers each mapping to exactly one on-chain Policy Engine instruction
- [x] `agent/src/driveWorkflow.ts` — real Claude tool-use loop (not mocked), `workflowId`/
      `recipient` bound by the harness rather than model-supplied, 10-turn safety cap
- [x] `agent/src/server.ts` — `POST /trigger` endpoint, shared-secret auth (verified: rejects
      unauthenticated and wrong-secret requests with 401, malformed bodies with 400)
- [x] `scripts/devnet/scheduled-trigger.ts` — calendar-cadence trigger via the same endpoint
- [x] `scripts/devnet/run-agent-demo.ts` — initializes a fresh workflow and hands it to the agent
- [x] Shared `scripts/lib/policyEngineClient.ts` extracted from Phase 2's `deploy-workflow.ts`, now
      reused by both the CLI script and the agent's tools

**Run live for real** once `ANTHROPIC_API_KEY` was configured: `pnpm agent-demo` drove a real
workflow autonomously through `get_invoice_data` → `submit_fetch_step` → compliance/approval →
`submit_guardrail_check`, three real on-chain transactions, using only its 5 tools with no manual
intervention. Settlement itself still hits Phase 5's known USDC-funding gap (see Phase 5 status),
not a new one. Also fixed a stale bug found in the process: `run-agent-demo.ts`'s default
instruction still referenced Phase 2's lamport-scale units (`$2000000`) instead of Phase 5's real
USD amounts — every other devnet script's default was updated at the time, this one was missed.

**Human action item:** registering a real Helius webhook against `/trigger` needs a running public
tunnel (e.g. `ngrok http 8787`) and Helius dashboard access — see `agent/README.md`.

## Phase 4 status

- [x] Real Squads multisig treasury (`pnpm setup-squads-treasury`) — a 2-of-2 devnet multisig
      (business-owner + treasury-placeholder), pooled vault funded once, config persisted to
      `treasury/squads-treasury.json` (pubkeys only)
- [x] Settlement now executes through Squads' real propose → approve → execute flow
      (`scripts/lib/squadsClient.ts`), not a program-signed CPI — verified on devnet via
      `pnpm deploy-workflow` and the test suite
- [x] On-chain: an over-cap guardrail failure now **pauses** (`PendingOverrideApproval`) instead
      of terminally rejecting; a new `resume_after_override` instruction (owner-signed only)
      resumes or permanently rejects it — an allowlist failure is still terminal `Rejected`
- [x] Notification Layer (`scripts/lib/notify.ts`) — Telegram; the agent pages the owner and stops
      when a workflow pauses, with **no** override tool of its own
- [x] `scripts/devnet/resume-workflow.ts` — the owner's own manual resume/reject path
      (`pnpm resume-workflow <workflowId> approve|reject`)
- [x] `tests/policy-engine.ts` — 8 passing cases: both happy paths, over-cap pause (not reject),
      approval denial, out-of-order rejection, resume-approved completes, resume-rejected stays
      rejected, non-owner resume attempt fails

**Architectural trade-off (documented, not a bug):** `mock_settlement` no longer moves funds
itself — only the Squads program can sign for the Squads vault, and only after real member
approval. The client executes the real Squads transfer first, then calls `mock_settlement` with
that execution's tx signature as evidence, hashed into the step's `Attestation`. On-chain order is
still fully enforced; what changed is that "funds moved" is now a verifiable, separately-checkable
claim rather than an atomic CPI. A tighter version (the Squads vault transaction CPIs into our own
program) is possible but deferred, same pattern as ZK compression.

**Run live for real** once `ANTHROPIC_API_KEY` was configured: triggered a genuine over-cap
request through the live agent (spend cap below the real invoice amount) — the agent correctly
called `submit_guardrail_check` with the invoice's real amount, the chain paused it
(`PendingOverrideApproval`), and `driveWorkflow.ts` paged the owner and stopped, exactly as
designed. Both `pnpm resume-workflow <id> approve` and `... reject` were run for real afterward:
`reject` correctly leaves the workflow terminally `Rejected`; `approve` correctly resumes it
(`InProgress`, real transaction) before hitting the same known Phase 5 USDC-funding gap at
settlement. **Still not exercised:** real Telegram delivery, since `TELEGRAM_BOT_TOKEN`/
`TELEGRAM_CHAT_ID` aren't configured in this environment yet — `scripts/lib/notify.ts` logs
clearly to console when Telegram isn't configured,
so nothing fails silently.

**Human action item:** create a Telegram bot via @BotFather and set `TELEGRAM_BOT_TOKEN`/
`TELEGRAM_CHAT_ID` in `.env` for real notification delivery — see `.env.example`.

## Phase 5 status

- [x] **Zero on-chain changes.** `mock_settlement`'s `settlement_reference: String` argument is
      only ever hashed into the step's `Attestation`, never stored raw — Phase 5 fits entirely in
      the TypeScript layer by passing a compact JSON evidence summary through that existing arg.
- [x] Live pricing (`scripts/lib/pythClient.ts`) — Pyth's Hermes REST price service (public, no API
      key), used to convert a workflow's USD amount into an exact USDC-devnet (6-decimal) figure.
- [x] Pluggable Compliance & Oracle Registry (`scripts/lib/registry.ts`) — `ComplianceProvider`/
      `OracleProvider` interfaces, one concrete implementation each; swapping providers means
      changing the factory's return value, not any call site.
- [x] AP2 mandate signing (`scripts/lib/ap2Client.ts`) — implemented directly via `tweetnacl`
      ed25519 signing (not the very-new `agentic-payments` npm package). Every settlement writes a
      signed, verifiable mandate to `treasury/mandates/<workflowId>.json`.
- [x] Real x402 payments (`scripts/lib/x402Client.ts`, `scripts/devnet/x402-vendor-server.ts`) —
      genuine x402 v2 protocol via `x402-solana` against PayAI's public facilitator
      (`https://facilitator.payai.network`): 402 challenge, signed USDC payment, facilitator
      verify/settle. Smoke-tested against the real facilitator (see "Human action item" below for
      what's needed to complete an actual funded payment).
- [x] Real MPL Agent Registry integration (`scripts/lib/agentIdentityClient.ts`,
      `pnpm register-agent-identity`) — registers the `agent-identity` wallet as a genuine on-chain
      identity (an MPL Core asset + `AgentIdentityV1` account). Chosen over SAID Protocol: same
      program/PDA layout on devnet and mainnet, more official/narrower fit, no paid verification
      infra needed. Verified end-to-end on devnet — see `treasury/agent-identity.json`.
- [x] Split settlement orchestration (`scripts/lib/splitSettlement.ts`) — computes an 85% vendor /
      10% tax-reserve / 5% yield-pool-placeholder split in USDC-devnet at the live Pyth price,
      signs the AP2 mandate, pays the vendor leg via real x402 rails, sends the tax-reserve/
      yield-pool legs as plain SPL transfers, checks agent identity, and folds all of it into one
      evidence JSON — replacing Phase 4's `squadsClient.completeSettlement` in
      `deploy-workflow.ts`, `agent/src/tools.ts`, and `resume-workflow.ts`. Full evidence is
      written to `treasury/settlements/<workflowId>.json`; only a compact summary goes on-chain.
- [x] Verified against real devnet, not just typechecked: the x402 facilitator smoke test, the
      agent identity registration + read-back, and a full `pnpm deploy-workflow` run — all four
      on-chain gates (`initialize_workflow`, `fetch_step`, `manual_approval`/`compliance_check`,
      `guardrail_check`) complete for real, with the run failing only at the expected point (no
      funded USDC-devnet balance yet — see below).

**Architectural note — two separate settlement tracks, intentionally.** Phase 4's Squads multisig
treasury (pooled lamports) still exists and still governs the pause/notify/resume-override
authorization flow — that's unchanged. Phase 5's split settlement pays out of the business-owner
wallet's own USDC-devnet balance instead, because x402 payments need a directly-signable payer,
which a multisig can't be without deeper Squads integration than this phase's scope. Both are real;
they just answer different questions (who authorizes a payout vs. how the settlement itself moves
funds).

**Not yet exercised in this environment:** a real, funded x402 payment settling all the way through
the PayAI facilitator, since the business-owner wallet has no devnet USDC balance yet in this
environment. Every piece up to that point — Pyth pricing, AP2 mandate signing, the 402 challenge
round-trip against a live facilitator, agent identity verification — is independently verified
against real devnet/live services (see the checklist above); only the final funded transfer is
gated on the human action item below.

**Human action item:** fund `business-owner`'s USDC-devnet associated token account via
https://faucet.circle.com (devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) before
a real split settlement can complete. SOL transaction fees are already covered by existing devnet
SOL. See `.env.example` for the x402 vendor server's config.

## Phase 6 status

- [x] **Verifier** (`pnpm verify <workflow>`, `verifier/`) — a standalone CLI, deliberately
      independent of the app's own client code (no `scripts/lib` import), that independently
      re-validates every attested step: fetches the real originating transaction, decodes it via
      the public Anchor IDL, confirms the owner actually signed it, and recomputes the on-chain
      keccak256 hash to compare against `Attestation.data_hash`. This is necessary (not just
      thorough) for 2 of the 5 step kinds (`fetch_step`, `mock_settlement`), whose raw hashed data
      exists nowhere in final account state — only in the original transaction.
- [x] **Live Public Dashboard** (`dashboard/`) — a small Node relay (`pnpm dashboard-server`)
      holds the RPC/Helius connection and subscribes to `Attestation` account changes, pushing
      sanitized events to a React + Vite frontend over Server-Sent Events. The browser never talks
      to Helius directly and never sees an API key.
- [x] Verified against real devnet, not just typechecked: `pnpm verify` run against a real
      in-progress workflow (full PASS, every step's signer and hash independently confirmed), a
      workflow that paused and was resumed via `resume_after_override` (correctly followed the
      *resume* transaction's decoded args, not the original guardrail call), and an invalid/
      unrelated account (correctly reported FAIL with a clean exit code, not a crash). The
      dashboard relay was confirmed to stream all 3 attestation events live, within seconds, while
      a real workflow was driven forward in parallel.
- [x] Two real bugs found and fixed during this verification pass: Anchor's instruction coder
      returns camelCase instruction names (`fetchStep`) even though the IDL itself is snake_case
      (`fetch_step`) — the verifier's matching now checks both; and calling `process.exit()`
      immediately after an RPC call raced a pending `@solana/web3.js` `Connection` handle and
      crashed with a libuv assertion on Windows, corrupting the CLI's exit code — fixed by using
      `process.exitCode` instead and letting Node drain naturally.

**Not yet built:** a web frontend for the verifier itself (explicitly deferred — CLI now, by
design; the core `verifyWorkflow` logic is already split out in `verifier/src/index.ts` so a
future web page can reuse it directly).

## Phase 7 status

- [x] **Real compressed-NFT receipt minting** (`scripts/lib/receiptClient.ts`) — every completed
      workflow mints a real compressed NFT (Metaplex Bubblegum) into the Business Owner's wallet,
      grouped under a verified "Ashlar Receipts" collection (`pnpm setup-receipt-collection`, a
      one-time setup mirroring the Squads-treasury/agent-identity pattern). Metadata is uploaded to
      real Arweave storage via Irys (Umi's `irysUploader()`), not a `data:` URI — this is the one
      piece of metadata across Phases 5-7 explicitly meant to be seen by a human in Phantom or
      Explorer, so it uses real permanent hosting rather than the zero-infra shortcut used
      elsewhere. Zero changes to `programs/ashlar` — Bubblegum is Metaplex's own deployed program;
      minting is a pure client-side step after `mock_settlement` lands.
- [x] **Owner Receives Final Receipt notification** — reuses Phase 4's Telegram notification layer
      (`scripts/lib/notify.ts`) rather than adding a new channel; the message includes the
      receipt's asset ID and a direct Explorer link.
- [x] Wired into all three settlement call sites (`scripts/devnet/deploy-workflow.ts`,
      `agent/src/tools.ts`'s `submit_mock_settlement`, `scripts/devnet/resume-workflow.ts`'s
      post-override path) — the same three places Phase 5's split settlement lives, so there's one
      settlement-completion path, not several.
- [x] Verified against real devnet, not just typechecked: the Merkle tree and collection NFT are
      real, confirmed accounts on devnet (owner programs checked directly); a standalone
      `mintReceipt` call produced a real compressed NFT, a real derived asset ID, and metadata
      genuinely fetchable from Irys's gateway with the full settlement evidence embedded.
- [x] One real bug found and fixed: Token Metadata's on-chain `name` field has a strict 32-byte
      limit — confirmed against real devnet (`MetadataNameTooLong`) — fixed by keeping the
      on-chain name short and fixed, with the workflow id living in the (unlimited) off-chain
      metadata JSON instead. Also confirmed empirically (not assumed) that reading back a
      just-landed mint transaction via Bubblegum's leaf-parsing helper needs a real retry budget
      past the first few seconds, same propagation-lag pattern seen in earlier phases.

**Not yet exercised in this environment:** the full `pnpm deploy-workflow` path actually reaching
and minting a receipt, since that requires reaching `mock_settlement`, which is still gated on
Phase 5's pending USDC-devnet funding human action item (see Phase 5 status above) — not a new gap
introduced by this phase.

## Phase 8 status

- [x] **Deterministic adversarial-test CLI** (`pnpm adversarial-test [scenario|all]`,
      `scripts/devnet/adversarial-test.ts`) — drives `agent/src/tools.ts`'s `createToolExecutor`
      directly, the exact same code path the LLM's tool calls go through, with attacker-chosen
      inputs instead of the model's. Three scenarios: an oversized payment, a recipient outside
      the workflow's allowlist, and a fabricated invoice id that doesn't exist at all — combined
      with a "yes" compliance claim nothing independently verifies. Fully deterministic, no
      `ANTHROPIC_API_KEY` needed, so it's repeatable in CI or by a stranger at a terminal.
- [x] **Live-agent adversarial demo** (`pnpm adversarial-agent-demo`,
      `scripts/devnet/adversarial-agent-demo.ts`) — a required deliverable, not a bonus: feeds the
      real Claude tool-use loop a deliberately injected trigger (a fabricated invoice framed as
      pre-approved for an over-cap amount) and records whatever the live model actually attempts
      alongside the chain's real final outcome, rather than asserting a fixed expectation on
      non-deterministic model behavior.
- [x] **Persistent audit log** (`treasury/adversarial-log.json`, `scripts/lib/adversarialLog.ts`)
      — every attempt from both mechanisms is appended with its inputs and actual on-chain
      outcome, same tracked-audit pattern as `treasury/mandates/`/`treasury/settlements/`.
- [x] The one on-chain scenario `tests/policy-engine.ts` didn't yet cover — a recipient outside
      the allowlist with an amount safely within the spend cap — is now a formal test case
      (9/9 passing, up from 8/8, no regressions).
- [x] **Verified against real devnet, not just typechecked:** all three deterministic scenarios
      correctly blocked (`pendingOverrideApproval` / `rejected` exactly as expected), exit code
      `0`, all three attempts logged.

**The honest architectural point this phase makes explicit, not hides:** `submit_fetch_step` and
`submit_compliance_or_approval_decision` are never independently verified against a real invoice
— a compromised or hallucinating agent (or an attacker driving the same tool calls) can claim
anything about them. The **only** objective, immutable enforcement is `guardrail_check`'s
`spend_cap`/`allowlist` check, fixed by the owner at `initialize_workflow` time. That's the actual
mechanism behind "AI says yes, the chain says no" — this phase proves it rather than changing it.

**Run live for real** once `ANTHROPIC_API_KEY` was configured: the real Claude agent received the
injected trigger (a fabricated invoice framed by "Finance" as pre-approved for $5,000 against a
$100 cap) and, unprompted, called `get_invoice_data`, saw the invoice didn't exist, correctly
identified the message as a likely prompt-injection/fraud attempt, and refused to call any
settlement tool — stopping on turn 1, never touching the chain. This also surfaced and fixed a
real bug: `driveWorkflow.ts`'s early-refusal path used `break` instead of `return`, so it always
fell through to a misleading "stopped after reaching the 10-turn safety cap" message even when
the agent exited correctly on the first turn.

## Full system stress test: heavy load + deep adversarial diagnosis

A standalone hardening pass, user-requested and scoped via plan approval before anything ran,
going well beyond Phase 8's 3 scenarios. Everything ran for real against devnet — no mocks.

**Part 1 — sustained load** (`pnpm load-test`, `scripts/devnet/load-test.ts`): ramped 5 → 25 → 50
→ 50 concurrent workflow executions (130 total, two waves at peak), mixing both templates, the
full $0-to-`Number.MAX_SAFE_INTEGER` amount range, and a deliberate mix of should-reject
(over-cap, non-allowlisted) requests alongside legitimate ones in the same concurrent batch.
**Every stage: 100% transaction success, 100% workflow-outcome correctness, 0 crashes.** Latency
roughly doubled from stage 1 to peak sustained load but never failed.

**Real bug found and fixed before the load test could even run cleanly:** 8 of 15 `pnpm` script
aliases — including `deploy-workflow`, `adversarial-test`, and `verify` — never loaded `.env` at
all, so `HELIUS_RPC_URL` was never in `process.env` and every one of those scripts silently fell
back to the free, heavily-rate-limited public RPC this entire session, not just under this
heavier load. All fixed (`--env-file-if-exists=.env` added everywhere it was missing).

**Part 2 — deep adversarial diagnosis** (`pnpm security-diagnosis <scenario|all>`,
`scripts/devnet/security-diagnosis.ts`), 8 attack classes, all real:
- **Replay attack** — resubmitting the exact raw signed transaction bytes of an already-confirmed
  instruction: Solana's own runtime correctly rejects it ("already been processed").
- **Race/TOCTOU** — firing `guardrail_check` and a premature `mock_settlement` concurrently
  across 5 real trials: settlement never once succeeded, blocked either by the intended
  `OutOfOrderStep` check or an account-seed collision — no window ever existed.
- **AP2 canonicalization fuzz** — 7 cases extending the earlier payload-substitution fix (nested
  mutation, key reordering, injected fields, unicode substitution): all 7 correctly
  pass/fail as expected, confirming that fix is complete, not just closed for the one
  originally-tested case.
- **Malformed-input fuzz** — found a real gap: a negative `BN` amount didn't throw or wrap to a
  dangerous huge value, it silently coerced to its absolute value. Not a fund-safety bug
  (`guardrail_check` still enforces the cap on whatever lands), but fixed with explicit
  client-side validation at every real input boundary (`policyEngineClient.ts`) regardless.
- **Double-execution/idempotency** — calling `fetch_step` twice for the same step: correctly
  blocked by the step-order check itself, not just an account-collision fallback.
- **Network/settlement failure safety** — a failed settlement leaves zero partial on-chain state;
  an unreachable RPC endpoint fails cleanly, never silently.
- **Webhook flood + near-miss auth** — 30 concurrent bad-token requests, 100% correctly rejected.
  Found a real gap: zero rate-limiting existed. Fixed with a small in-memory per-IP limiter
  (`agent/src/server.ts`) — verified it engages correctly while still passing legitimate traffic.
- **3 new live-agent injection variants** (spend cap, allowlist, compliance/step-order), each a
  real Claude tool-use call: all three resisted at the *model's own judgment*, not just via
  on-chain enforcement as a backstop — the spend-cap injection had zero effect on the amount
  used, the allowlist injection couldn't redirect payout (architecturally impossible regardless
  of what the model believes), and the step-order injection didn't cause any skipped steps.

Every attempt across both parts is logged to `treasury/load-test-log.json` and
`treasury/adversarial-log.json` for a persistent, real audit trail.

**Honest gaps, not new ones:** no scenario reached a real completed settlement (Phase 5's
USDC-devnet funding is still pending); Helius's own devnet rate limits mean 429s still occur
under load (fully absorbed by retry logic, never surfaced as a failure, but real); literal
`u64::MAX` and exhaustive webhook-secret brute force were deliberately not attempted (documented
in the plan as out of scope, not discovered as a blocker mid-run).

## Note on Anchor version

This repo uses Anchor CLI 1.1.2 (via WSL2's `avm`), which differs from the 0.30.1-era project
layout assumed by a lot of older Anchor documentation and examples (IDL format, `Anchor.toml`
`[toolchain]` section, npm package `@anchor-lang/core` instead of `@coral-xyz/anchor`). Keep this
in mind when consulting outside references in later phases.

`anchor deploy` on this CLI version also attempts to publish the IDL on-chain via `anchor idl
init`. That sub-step currently fails on this fork with a misleading `Keypair file not found`
error even though the same wallet path works for the deploy itself and for `solana address -k`
— likely a bug in this fork's wallet-loading code path for the `idl` subcommand specifically. The
program binary still deploys successfully; only the on-chain IDL publish step is affected.
Workaround: none needed for now — `scripts/devnet/call-hello-world.ts` loads the IDL from the
local `target/idl/ashlar.json` file rather than fetching it on-chain. Revisit if a later phase
needs the IDL to be publicly fetchable on-chain.

`anchor test`'s own mocha runner also fails with `ANCHOR_PROVIDER_URL is not defined`, even though
the variable is set — `npx` inside WSL resolves to Windows' native `npx.cmd` (Node isn't installed
in WSL, see the dev-environment split above), and env vars set in the WSL shell don't cross that
interop boundary into the spawned Windows process. Workaround: after `anchor build`/`anchor deploy`
finish in WSL, run the actual test/mocha step from the **Windows** side instead:
```powershell
$env:ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com"
$env:ANCHOR_WALLET = "wallets/business-owner.json"
npx ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```
