# How Ashlar Works

A complete, plain-language walkthrough of what this project is, why it's built the way it is, and
exactly what happens — step by step, file by file — from a sentence in English to money moving on
Solana and a stranger independently proving it really happened.

---

## 1. What Ashlar actually is

Ashlar is a **programmable financial workflow engine for AI agents**, built on Solana.

The one-sentence version: **you describe a payment policy in English, Ashlar compiles it into a
fixed on-chain program, and an AI agent is allowed to *drive* that program forward — but never to
bypass it.** Every step the agent takes is checked by immutable on-chain rules (spend caps,
recipient allowlists), every check is written as a signed, hashed proof on Solana, and a completely
independent tool can re-derive that entire proof chain from scratch, with no login and no trust in
Ashlar's own code.

The name is the metaphor: an **ashlar** is a stone block cut so precisely it needs no mortar — once
placed, it doesn't move. Once your instruction is compiled, the resulting on-chain program is the
same kind of thing: fixed, load-bearing, and nothing — not even the AI — can talk it out of its
shape.

### The problem this solves

Handing an AI agent control over real payments is normally an all-or-nothing trust decision: the
model's output *is* the transaction. If it hallucinates, gets prompt-injected, or is simply wrong,
there's nothing standing between a bad decision and your money moving. Ashlar's answer is
architectural, not behavioral: **the model is structurally incapable of doing anything except ask
the chain to run the next pre-compiled step.** It cannot construct a transaction. It cannot pick
its own action. The chain enforces the actual boundaries — the model just narrates.

---

## 2. The big picture

```
 English instruction
        │
        ▼
 ┌─────────────────┐        deterministic, no LLM
 │   @ashlar/compiler│       involved in this step
 └─────────────────┘
        │  CompiledWorkflow (workflowType + steps[] + parameters)
        ▼
 ┌───────────────────────────────────────────────────────────┐
 │            Solana devnet — Anchor program "ashlar"          │
 │                                                               │
 │  initialize_workflow → fetch_step → compliance_check /       │
 │  manual_approval → guardrail_check → mock_settlement          │
 │                          │                                    │
 │             (over cap) → resume_after_override (owner-only)   │
 │                                                               │
 │  Every step writes: 1 Attestation PDA + 1 Ledger entry        │
 └───────────────────────────────────────────────────────────┘
        ▲                                   │
        │ 5 narrow typed tool calls          │ real settlement rails
        │ (never raw transactions)           ▼
 ┌─────────────┐                    Pyth · AP2 · x402/PayAI ·
 │  AI agent    │                    MPL Agent Registry
 │ (Claude)     │                          │
 └─────────────┘                          ▼
                                    Bubblegum cNFT receipt
                                    (Irys/Arweave metadata)
        │
        ▼
 ┌─────────────────┐        ┌──────────────────────────┐
 │ @ashlar/verifier │◄──────►│ Live dashboard (SSE relay) │
 │ (independent,     │       │ + landing page              │
 │  zero shared code)│       └──────────────────────────┘
 └─────────────────┘
```

Six things are true about this picture, and they're the whole point of the project:

1. **The compiler is deterministic** — no model runs during compilation. An instruction like `"Pay
   up to $50 every Friday to allowlisted vendors."` always produces the exact same compiled step
   sequence.
2. **The on-chain program is the only thing that can move money or advance state.** Nothing
   off-chain "executes" anything — it only asks the program to run the next instruction.
3. **The AI's entire action space is 5 typed tool schemas.** It can request a step. It cannot emit
   raw instruction bytes, and it cannot choose *which* wallet address ultimately receives funds —
   that's bound by the calling code, never supplied by the model.
4. **Every step, pass or fail, writes a permanent, signed, hashed record on-chain** — not just a
   final "done" flag.
5. **Settlement is real** — real Pyth pricing, a real signed AP2 payment mandate, a real x402
   payment through a live facilitator, real SPL token transfers.
6. **Nothing about the proof depends on trusting Ashlar's own code.** The verifier package
   deliberately shares zero code with the rest of the app and re-derives everything from Solana's
   own transaction history using only the public program IDL.

---

## 3. The full end-to-end flow

This is what actually happens, in order, when someone runs
`pnpm deploy-workflow "Pay up to $50 every Friday to allowlisted vendors."` — the same sequence the
dashboard's "Deploy a workflow" button triggers over HTTP.

### Step 0 — Compile

`compiler/src/index.ts` takes the raw English string and tries each registered **template**
against it:

- **`recurringConditionalPayment`** matches on cues like `every`, `pay`/`payment`, `every <weekday>`,
  `up to $N` / `capped at $N`, and `allowlisted vendors` — it's what a phrase like *"Pay up to $50
  every Friday to allowlisted vendors."* compiles into.
- **`oneTimeApprovalGatedTransfer`** matches on cues like `pending my approval`, `requires
  approval`, plus an `<amount> to <recipient>` pattern — e.g. *"Transfer $5 to Acme Corp, pending
  my approval."*

Each template turns the sentence into a `CompiledWorkflow`: a `workflowType`, a fixed `steps[]`
array (`fetch → compliance_check/manual_approval → guardrail_check → settlement → attestation →
ledger_write`), and extracted `parameters` (amount, recipient, spend cap, currency). This is pure
string parsing — regex-based, no network call, no LLM. It's deterministic on purpose: the very
first guarantee Ashlar makes is that the same sentence always becomes the same program.

### Step 1 — Initialize the on-chain workflow

`scripts/lib/deployWorkflow.ts` (shared by the CLI and the dashboard's relay) takes the compiled
workflow and calls the Anchor program's `initialize_workflow` instruction. This creates two new
accounts on Solana, both PDAs (Program Derived Addresses — deterministic accounts owned by the
program, not by any keypair):

- **`WorkflowInstance`** — `[b"workflow", owner, workflow_id]` — holds `owner`, `workflow_id`
  (a `Date.now()` timestamp), `workflow_type`, the fixed `steps[]` sequence, `current_step`,
  `status`, `spend_cap`, `allowlist`, and (once guardrail_check runs) `pending_amount` /
  `pending_recipient`.
- **`Ledger`** — `[b"ledger", workflow]` — a running list of `{step_index, step_kind, outcome,
  timestamp}` entries, capped at 4 — the one account you can read to get the whole proof trail back
  in one call.

`spend_cap` and `allowlist` are set **once, here, by the owner** — and never touched again except
by the immutable on-chain logic itself. This is the seed of everything the guardrail later
enforces.

### Step 2 — The AI agent drives it forward

This is the part that makes Ashlar's core claim real rather than aspirational. `agent/src/tools.ts`
defines exactly **5 tool schemas** for Claude:

| Tool | What it actually does |
|---|---|
| `get_invoice_data` | Read-only. Looks up a mock invoice. No chain call. |
| `submit_fetch_step` | Calls on-chain `fetch_step` with the model-supplied invoice id/amount. |
| `submit_compliance_or_approval_decision` | Calls whichever of `compliance_check` / `manual_approval` matches the workflow's *on-chain-stored* type — the harness picks the instruction, not the model. |
| `submit_guardrail_check` | Calls on-chain `guardrail_check`. |
| `submit_mock_settlement` | Triggers the real settlement (see Step 4) then calls on-chain `mock_settlement`. |

`agent/src/driveWorkflow.ts` runs a real Anthropic tool-use loop (`@anthropic-ai/sdk`): it hands
Claude these 5 tools and a system prompt describing the workflow, and Claude decides what to call
and when, turn by turn, until the workflow reaches a terminal on-chain status or a 10-turn safety
cap. **The signing key itself lives in the harness's tool-execution code, never in the model** —
Claude's tool-use API structurally only lets it emit `{tool_name, tool_input}` matching a declared
JSON schema. There is no tool that accepts raw instruction data, so there is no way for the model
to construct a transaction even if it wanted to.

For CLI/dashboard-triggered runs (not the live-agent demo), `deployWorkflow.ts` calls the same
underlying `scripts/lib/policyEngineClient.ts` functions directly and non-interactively, walking the
same 4 gates the agent would — this is what makes `pnpm deploy-workflow` fast and repeatable for
everyday use, while `pnpm agent-demo` exercises the real live-Claude path end to end.

### Step 3 — The hard checks (the part nothing can talk its way around)

Two on-chain instructions do the actual enforcing:

- **`compliance_check` / `manual_approval`** — records a decision (`approved: true/false`).
  Honest limitation, stated plainly: nothing independently verifies *why* — this step records
  whatever it's told, the same way a human approver's sign-off isn't independently re-derived
  either.
- **`guardrail_check`** — the one instruction that is genuinely, immutably load-bearing:
  - If `amount > spend_cap` → status becomes `PendingOverrideApproval`. **Paused, not silently
    allowed, not silently blocked** — it needs a real, separate, owner-signed transaction
    (`resume_after_override`) to go any further. This is the on-chain analogue of "call your
    manager."
  - If `recipient` isn't in the workflow's `allowlist` → status becomes `Rejected`. **Terminal.**
    No override path. Nothing — not the agent, not a compromised harness, not a convincing prompt
    injection — can talk the chain into paying an address the owner never approved.

  This is deliberately the one boundary the adversarial testing in this project targets
  specifically, because it's the one boundary that's actually structurally unbypassable.

### Step 4 — Real settlement

Once guardrail passes, `scripts/lib/splitSettlement.ts` runs the actual money movement — entirely
off-chain rails, because the on-chain `mock_settlement` instruction only ever hashes a settlement
reference string, never moves funds itself:

1. **Pyth Hermes** (`scripts/lib/pythClient.ts`) — fetches the live USDC/USD price, no API key
   needed, converts the USD amount into an exact 6-decimal USDC-devnet atomic amount.
2. **AP2 mandate** (`scripts/lib/ap2Client.ts`) — builds a canonical JSON mandate (who's paying
   whom, how much, for what) and signs it with the payer's real ed25519 key via `tweetnacl` — a
   genuine cryptographic authorization artifact, independently verifiable.
3. **The split**: **85% vendor / 10% tax-reserve / 5% yield-pool**, computed as exact atomic
   amounts (the yield-pool leg absorbs integer-rounding remainder so the three legs always sum
   exactly).
4. **x402 payment** (`scripts/lib/x402Client.ts`) — the vendor leg is paid through the real x402
   protocol: hit the vendor's `/invoice` endpoint, get a real HTTP `402 Payment Required` with
   payment requirements, construct and sign the USDC payment, retry with an `X-PAYMENT` header, the
   vendor server verifies and settles it against **PayAI's live public facilitator**.
5. **Plain SPL transfers** for the tax-reserve and yield-pool legs (`@solana/spl-token`'s
   `transferChecked`) — real token movements, just not through x402 (x402 is for paying an external
   endpoint for something, not for internal fund allocation).
6. **Agent identity check** — reads back the agent's on-chain identity (see §5, MPL Agent
   Registry) and folds its verification status into the evidence.
7. Everything gets written to `treasury/settlements/<workflowId>.json` (the full evidence) and a
   compact JSON summary is hashed into the on-chain `mock_settlement` call.

### Step 5 — Attestation, every single step

This is the part that makes "prove it happened" literal instead of aspirational. Every one of the
5 real on-chain instructions (`fetch_step`, `compliance_check`/`manual_approval`,
`guardrail_check`, `mock_settlement`, `resume_after_override`) shares one helper
(`attest_and_log`) that, on every call:

- writes an **`Attestation`** PDA (`[b"attestation", workflow, step_index]`) recording
  `step_kind`, `outcome`, `executed_by`, `timestamp`, and a **`keccak256` hash of that step's real
  instruction data** (not the data itself — just enough to prove later that a specific real value
  was submitted, without bloating account storage).
- appends one entry to the workflow's `Ledger`.

A completed one-time-approval workflow ends with exactly 4 attestations and 4 ledger entries — a
small, directly-readable proof trail, not a black box.

### Step 6 — Receipt

Once the workflow is genuinely `Completed`, `scripts/lib/receiptClient.ts` mints a **real
compressed NFT** (Metaplex Bubblegum) into the owner's wallet: uploads human-readable metadata
(split breakdown, settlement evidence, a pointer to `pnpm verify`) to **Arweave via Irys**, then
mints into a shared "Ashlar Receipts" collection tree. Viewable in Phantom or Explorer like any
other NFT.

### Step 7 — Independent verification

`verifier/src/verifyWorkflow.ts` is the payoff. Run as `pnpm verify <workflowPda>` or from the
dashboard's Verifier page, it does the thing the whole system is built to make possible: **prove
the workflow really happened without trusting a single line of Ashlar's own client code.**

For every attested step it:
1. Fetches the real transaction that produced it (`getSignaturesForAddress` +
   `getTransaction`) — not cached data, the actual chain history.
2. Confirms the transaction didn't fail (`meta.err === null`).
3. Decodes the real instruction arguments via the **public Anchor IDL** (a third-party,
   independently-auditable decoder — not Ashlar's own parsing code).
4. Confirms the real signer was the workflow's actual owner.
5. **Re-computes the exact keccak256 hash from the decoded arguments itself** and compares it to
   what's stored on-chain in the `Attestation`.

Two of the five step kinds (`fetch_step`, `mock_settlement`) have **no recoverable preimage
anywhere in final account state** — the only place their raw hashed data ever existed is inside
that one original transaction. This is precisely why full transaction-history replay was chosen
over a cheaper "just read the final account state" design — a shortcut verifier literally could
not check those two steps at all.

The verifier deliberately imports nothing from `scripts/lib/` — it re-derives PDAs and re-reads
accounts itself, using only `@solana/web3.js` and `@anchor-lang/core`. The point isn't "Ashlar's
signing was correct" (Solana's own consensus already guarantees that) — it's "the data that got
hashed and attested is exactly the data a completely independent read-and-recompute path also
arrives at."

---

## 4. What each part of the repo actually is, and why it exists

| Path | What it is | Why it's a separate piece |
|---|---|---|
| `programs/ashlar/` | The Anchor (Rust) on-chain program — the only thing with real enforcement authority | Everything else is a client of this; it's the one piece that can't be argued with |
| `compiler/` (`@ashlar/compiler`) | English → `CompiledWorkflow`, deterministic, no LLM | Keeps "what the program will do" fixed and auditable *before* any AI touches it |
| `agent/` (`@ashlar/agent`) | Claude tool-use harness, 5 typed tools, zero signing authority | The AI's entire action space needs to be small enough to reason about; a general-purpose "agent kit" that can sign transactions would defeat the whole design |
| `verifier/` (`@ashlar/verifier`) | Standalone re-verification tool, shares no code with the app | If it imported the app's own helpers, a bug in Ashlar's code could hide itself from its own checker |
| `dashboard/` (`@ashlar/dashboard`) | Live operator UI: deploy, watch, approve/reject, verify, settlements, receipts | A Node relay holds the RPC key server-side so the browser never sees it; write actions are gated by a loopback-only check, not a secret typed into a page |
| `landing/` (`@ashlar/landing`) | Marketing/explainer page | Deliberately holds zero signing authority — pure static content pointing at real, already-completed on-chain evidence |
| `scripts/lib/` | Shared TypeScript clients: policy-engine calls, Pyth, AP2, x402, Squads, receipts, notify | One place for PDA-derivation and instruction-calling logic to live, so the CLI, the agent, and the dashboard relay can't drift out of sync with each other |
| `scripts/devnet/` | Thin CLI entrypoints (`deploy-workflow`, `adversarial-test`, `load-test`, `security-diagnosis`, …) | Every capability is independently runnable and scriptable, not locked inside the UI |
| `treasury/` | Tracked audit trail — real settlement evidence, mandates, adversarial/load-test logs | Git-tracked, human-readable, exactly the kind of record a real financial system would keep |
| `wallets/` | Devnet keypairs (gitignored) + `manifest.json` (pubkeys only, tracked) | Real keys never committed; role→pubkey mapping stays reviewable |

---

## 5. The Solana-specific technology, and why each one

- **Anchor** (`programs/ashlar`, `@anchor-lang/core`) — the standard Rust framework for Solana
  programs. Chosen because it gives typed accounts, automatic IDL generation (which the verifier
  and dashboard both depend on for safe, independent decoding), and a well-understood security
  model (`has_one = owner` constraints, PDA derivation) rather than hand-rolling account
  validation.
- **PDAs (Program Derived Addresses)** — every account in this system (`WorkflowInstance`,
  `Ledger`, `Attestation`) is a PDA, deterministically derived from seeds like
  `[b"workflow", owner, workflow_id]`. This means anyone — the verifier included — can
  independently recompute the exact address a given workflow's accounts *must* live at, without
  asking Ashlar's own code where to look.
- **Squads (`@sqds/multisig`)** — real multisig treasury custody for the pause/override path. A
  workflow that legitimately exceeds its cap pauses to `PendingOverrideApproval`, and only a real
  Squads-authorized signer can resolve it — this is the on-chain analogue of "this needs a second
  person to sign off."
- **Pyth (Hermes REST API)** — live, public, keyless USD/USDC pricing, used to convert a
  USD-denominated instruction amount into an exact on-chain token amount at settlement time — not
  a hardcoded exchange rate.
- **x402 (`x402-solana`) + PayAI's public facilitator** — the actual HTTP-native micropayment
  protocol (`402 Payment Required` → signed payment header → facilitator verify/settle) used for
  the real vendor payment leg. Chosen over building custom payment infrastructure because "wire in
  existing rails instead of rebuilding them" is one of this project's explicit design principles.
- **AP2 (Agent Payments Protocol) mandates** — implemented directly via `tweetnacl` ed25519
  signing rather than the very new `agentic-payments` reference package (which shipped too
  recently in this project's timeline to depend on with confidence) — the mandate itself is still
  a real, independently-verifiable signed artifact either way.
- **MPL Agent Registry** (`@metaplex-foundation/mpl-agent-registry`) — gives the agent a real,
  on-chain-verifiable identity, checked as part of every settlement's evidence. Chosen over SAID
  Protocol as a narrower, more officially-documented fit for "verify this agent has an on-chain
  identity," without SAID's heavier paid-verification-badge scope.
- **Metaplex Bubblegum (compressed NFTs) + Irys/Arweave** — the receipt is a real compressed NFT,
  chosen specifically because compression keeps per-receipt on-chain cost small while the metadata
  (uploaded to Arweave via Irys) is still permanent and human-readable — this is what makes "the
  proof feels real, not abstract" concrete: it shows up in the owner's actual wallet.
- **Helius (enhanced RPC + DAS)** — the public `api.devnet.solana.com` endpoint hard-rate-limits
  under any real concurrency (confirmed empirically — ~30 simultaneous calls trigger hard 429s), so
  every client in this repo prefers `HELIUS_RPC_URL` when configured. The dashboard's Receipts
  page also uses Helius's DAS (Digital Asset Standard) `getAssetsByGroup` method — a live, indexed
  query for every compressed NFT in the "Ashlar Receipts" collection, which would otherwise require
  building a custom indexer.

---

## 6. The non-Solana technology, and why

- **Claude (Anthropic API, `@anthropic-ai/sdk`)** — real tool-use, not a scripted stand-in. The
  whole point of Phase 3 was proving "AI judgment safely boxed in" with a model actually making
  non-deterministic decisions, not a deterministic simulation of one.
- **Plain `node:http` servers, no framework** (`dashboard/server/relay.ts`, `agent/src/server.ts`)
  — a deliberate minimal-deps pattern repeated across this project: every server here is small
  enough to read in one sitting, with no framework-specific behavior to audit on top of the actual
  logic.
- **React 19 + Vite** — both frontends (`dashboard/`, `landing/`). No router library in either —
  the dashboard uses a plain `useState` page switch, matching the project's general "don't add a
  dependency you can avoid" stance.
- **Tailwind CSS v4 + Motion (Framer Motion) + `lucide-react`** — the shared design system across
  `landing/` and `dashboard/` (same CSS custom-property tokens duplicated between the two rather
  than extracted into a shared package, consistent with each part of this repo being
  self-contained).
- **TypeScript everywhere off-chain**, `strict` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes` — deliberately stricter than TypeScript's defaults, to catch
  exactly the class of bug ("assumed a field exists," "assumed an optional was set") that matters
  most in code that's moving real money.

---

## 7. The security model, stated directly

- **The only genuinely immutable, unbypassable on-chain boundary is `guardrail_check`'s spend cap
  and allowlist.** Everything else (`compliance_check`, `manual_approval`, `fetch_step`) records
  whatever it's told — there's no independent invoice-authenticity check on-chain, and that's a
  documented, deliberate limitation, not a hidden gap. The adversarial test suite
  (`pnpm adversarial-test`, `scripts/devnet/security-diagnosis.ts`) exists specifically to prove
  the one real boundary holds even when everything upstream of it is compromised or lying.
- **The agent's tool executor — not the model's output — is the trust boundary for `recipient` and
  `workflowId`.** The model supplies semantic arguments (an approval decision, an amount); *which*
  workflow and *who* gets paid is fixed by the calling harness code, never model-suppliable. This
  was verified, not just claimed, via a dedicated `unapproved-recipient` adversarial scenario.
- **A hardening pass beyond normal testing** exercised replay attacks, TOCTOU races, AP2 payload
  fuzzing, malformed/negative-amount input, double-execution attempts, webhook flooding, and live
  prompt-injection attempts against the actual running agent — found and fixed several real bugs
  in the process (an env-loading gap, silent negative-amount coercion, missing rate-limiting on the
  trigger server, a third-party `x402-solana` protocol version mismatch, an Anchor
  camelCase/snake_case IDL decoding bug, a Windows-specific crash, an NFT metadata length limit, a
  control-flow bug in the agent loop).

---

## 8. Honest simplifications (stated plainly, not hidden)

- **Everything runs on Solana devnet**, not mainnet. No claim is made about mainnet economics,
  liquidity, or cost at scale.
- **The 85/10/5 settlement split is a fixed constant**, not yet owner-configurable.
- **Tax-reserve and yield-pool legs are real token transfers to placeholder devnet wallets** — not
  a real lending-protocol deposit or real tax remittance.
- **Squads multisig members are both held locally by the same operator** in this devnet setup —
  architecturally identical to real multi-party custody (the Squads program itself doesn't know or
  care), but not actually multi-party here.
- **Load-tested to ~50 concurrent workflow executions**, not production traffic scale.
- **The dashboard's write endpoints (`/deploy`, `/resume`) are gated by a loopback-address check**
  — correct for "the operator runs this on their own machine," not hardened for a public,
  multi-tenant deployment (that would need real session authentication, which this project
  doesn't build).

---

## 9. Running it yourself

```bash
# One-off: compile + deploy a real workflow through all 5 gates on devnet
pnpm deploy-workflow "Pay up to $50 every Friday to allowlisted vendors."

# Independently re-verify any workflow's entire proof chain
pnpm verify <workflowPda>

# The live operator dashboard (deploy, watch, approve/reject, settlements, receipts, verify)
pnpm dashboard-server          # terminal 1 — the relay
pnpm --filter @ashlar/dashboard dev   # terminal 2 — the frontend

# The marketing/explainer page
pnpm --filter @ashlar/landing dev

# The real live-Claude agent loop, driving a fresh workflow end to end
pnpm agent-demo

# The adversarial + load-test hardening suite
pnpm adversarial-test all
pnpm load-test
```

Every one of these hits real Solana devnet — nothing in this list is a mock or a simulated
response.
