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

### Call it (Windows)

```powershell
pnpm hello-world
```
Prints the transaction signature and a devnet Explorer link.

## Phase 0 status

- [x] Repo scaffolded (this commit)
- [ ] Devnet wallets generated
- [ ] Hello-world program deployed to devnet and called successfully

## Note on Anchor version

This repo uses Anchor CLI 1.1.2 (via WSL2's `avm`), which differs from the 0.30.1-era project
layout assumed by a lot of older Anchor documentation and examples (IDL format, `Anchor.toml`
`[toolchain]` section). Keep this in mind when consulting outside references in later phases.
