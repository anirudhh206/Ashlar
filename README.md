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
integration in this repo; deferred to a later hardening pass, same as Squads was deferred to
Phase 4. Settlement is mocked (a plain lamport transfer from a per-workflow vault PDA standing in
for a stablecoin unit) — real x402/stablecoin settlement is Phase 5.

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

**Not yet run end-to-end:** `pnpm agent-demo` and the live trigger flow require a real
`ANTHROPIC_API_KEY` (see `.env.example`), which wasn't available in the environment this was built
in. Everything not gated on that key was verified directly: typecheck, lint, the refactored
`deploy-workflow.ts` still completing a full workflow on devnet, and the trigger server's auth
rejection paths (401/400) against a running server. Run `pnpm agent-demo` yourself once
`ANTHROPIC_API_KEY` is set to see the live agent loop.

**Human action item:** registering a real Helius webhook against `/trigger` needs a running public
tunnel (e.g. `ngrok http 8787`) and Helius dashboard access — see `agent/README.md`.

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
