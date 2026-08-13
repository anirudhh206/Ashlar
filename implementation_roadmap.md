# [Project Name] — Full Build Roadmap

## What This Project Is

A **programmable financial workflow engine for AI agents on Solana.** It lets a business owner type one plain-English instruction — *"pay every approved invoice every Friday"* — and turns it into a fixed, on-chain program that runs that process automatically, forever, without needing to trust an AI agent's judgment in the moment.

## What It Does

It closes a gap that nothing else in the market currently covers: every existing trust tool (agent identity, payment authorization, proof of reserve, SOC 2 audits) proves one narrow slice of a transaction, but nothing proves that an entire multi-step financial process — check, verify, settle, split, record — actually ran correctly, in order, in a way an outsider can independently confirm. This project produces that proof, one cryptographic attestation per step, so a bank, auditor, or vendor can verify the whole workflow without ever logging into the company's system.

## How It Does It

1. A **compiler** turns the instruction into a fixed on-chain program — not something an AI can improvise around later.
2. An **AI Agent Reasoning Layer** interprets live triggers and instructions, but is explicitly stripped of signing authority — its judgment is advisory only.
3. An **on-chain Solana engine** enforces hard-coded guardrails (spend caps, allowlists), executes settlement through existing rails (x402), and writes a signed attestation at every single step using Light Protocol's ZK Compression to keep costs near zero.
4. An **independent verifier** — a standalone tool anyone can run — checks that proof chain directly against the ledger, with no login and no trust required in the company's database.

---

## Phase 0 — Foundation & Setup
**Goal:** a working dev environment and empty but real project skeleton.
**Tasks:**
- Set up Solana CLI, Anchor framework, and a local validator for testing.
- Initialize the repo: `programs/` (Anchor programs), `compiler/` (instruction-to-program logic), `agent/` (AI reasoning layer), `verifier/` (standalone verification tool), `dashboard/` (live public dashboard).
- Create devnet wallets for: Business Owner, Treasury (Squads multisig), a test "vendor," and an adversarial test wallet.
- Get accounts/API keys: Helius (RPC + webhooks), Light Protocol / Photon indexer, Pyth price feeds, Squads.
**Done when:** you can deploy a trivial "hello world" Anchor program to devnet and call it from a script.

## Phase 1 — The Compiler (Instruction → Program)
**Goal:** prove the "engine, not app" thesis early — one compiler, multiple workflow types.
**Tasks:**
- Define a small set of workflow *templates* (recurring conditional payment, one-time approval-gated transfer) rather than trying to parse fully open-ended language on day one.
- Build the parser: plain-English or structured input → identified workflow type → parameter extraction (frequency, spend cap, allowlist, recipient rules).
- Generate a fixed step sequence (an ordered list of instructions) from the matched template — this is the artifact that gets deployed in Phase 2.
**Done when:** typing two different instructions produces two different, correctly-structured step sequences from the same compiler code.

## Phase 2 — Core On-Chain Engine
**Goal:** the actual Solana programs that enforce and execute the compiled workflow.
**Tasks:**
- **Policy Engine program (Anchor):** stores the compiled step sequence per workflow instance; enforces that steps execute in order; exposes the two decision gates (compliance check, guardrail check) as on-chain instructions.
- **Step Attestation Registry:** a PDA-per-step design, written using Light Protocol's ZK Compression so cost stays near-zero at scale. Each write is a signed proof of exactly what happened at that step.
- **Accounting Ledger:** append-only account structure that accumulates attestations into an auditor-legible running record.
**Done when:** you can manually trigger a fake invoice through Fetch → Compliance → Guardrail → (mock) Settlement → Attestation → Ledger, entirely on devnet, and read back a clean proof trail.

## Phase 3 — AI Agent Reasoning Layer
**Goal:** the layer that interprets live triggers, explicitly with no signing power.
**Tasks:**
- Integrate Solana Agent Kit to let an LLM-driven agent call real on-chain actions (read invoice data, call the Policy Engine's next-step instruction).
- Architect this so the agent's output can only ever be "call the next compiled instruction" — never "construct and sign an arbitrary transaction." This is the design choice that makes the whole security story true, not just claimed.
- Wire the Friday trigger via a Helius webhook or scheduled job that wakes the agent.
**Done when:** the agent can autonomously drive a workflow from trigger to completion using only Policy Engine calls — no free-form transaction construction anywhere in its code path.

## Phase 4 — Guardrails & Treasury Custody
**Goal:** the hard-coded safety layer that can't be talked around.
**Tasks:**
- Implement spend-cap and allowlist checks as on-chain program logic (not agent-side logic) inside the Policy Engine.
- Set up a Squads multisig as the actual treasury holding pooled funds; wire the Policy Engine to release funds from it only after the guardrail check passes.
- Build the Notification Layer (Helius webhook → push/email/Telegram) and the manual-approval resume path for over-cap requests.
**Done when:** a request that exceeds the cap correctly pauses, notifies the same Business Owner, and resumes only after their manual signature — never executing without it.

## Phase 5 — Settlement & Marketplace Integrations
**Goal:** wire in existing rails instead of rebuilding them.
**Tasks:**
- Integrate x402 for the actual stablecoin settlement call.
- Integrate AP2 to attach a signed authorization mandate to each settlement.
- Integrate (or stub, if time is short) the Solana Agent Registry / SAID Protocol for agent identity verification.
- Build the Split Payment step with real destinations: vendor wallet, tax reserve vault, and an auto-yield DeFi pool, using Pyth for pricing.
- Design the Compliance & Oracle Registry as a genuinely pluggable interface — even with one mock provider, the interface should make swapping providers trivial, since that pluggability *is* the marketplace pitch.
**Done when:** a real (devnet) stablecoin payment executes end-to-end through x402, split correctly across three destinations, priced via live Pyth data.

## Phase 6 — Verification Layer
**Goal:** the payoff — proof anyone can check without trusting you.
**Tasks:**
- Build the standalone Independent Verifier as a separate, minimal tool (CLI or simple web page) that takes a workflow ID, queries the Ledger and Attestation Registry directly via RPC, and independently re-validates every signature — with zero authentication against your own systems.
- Build the Live Public Dashboard using Helius WebSockets to stream attestations in real time as they land on-chain.
**Done when:** someone with no prior access to your codebase can run the verifier against a live workflow and get a correct pass/fail with no help from you.

## Phase 7 — Receipt & Output
**Goal:** make the final proof feel real, not abstract.
**Tasks:**
- Integrate Metaplex Bubblegum to mint the final receipt as a compressed NFT directly into the Business Owner's wallet.
- Wire the final "Owner Receives Final Receipt" notification.
**Done when:** completing a workflow results in an actual NFT appearing in a real (devnet) wallet, viewable in Phantom or a block explorer.

## Phase 8 — Security Hardening & the Adversarial Test
**Goal:** make the "AI says yes, the chain says no" moment real, not staged.
**Tasks:**
- Build the adversarial test path explicitly: a way to inject a live instruction at the Agent Reasoning Layer that has no corresponding real invoice.
- Confirm — through actual testing, not assumption — that this path is correctly rejected at the Compliance/Guardrail gate regardless of what the agent "concluded."
- Write a short internal test suite covering: oversized payment attempt, unapproved recipient attempt, and injected/manipulated instruction attempt. All three should fail safely and get logged.
**Done when:** you can hand a stranger a terminal and have them try to break it live, with a predictable, correct outcome every time.

## Phase 9 — Demo Prep & Polish
**Goal:** package everything into a working, rehearsed demo.
**Tasks:**
- Prepare the two-workflow proof (e.g., invoice payment + a second, structurally different workflow like a treasury rule) compiled from the same engine, to prove "platform, not app" live.
- Rehearse the exact demo choreography: live instruction → split-screen with Solana Explorer → deliberate guardrail trigger → adversarial injection attempt → independent verification by an audience member → cNFT receipt appearing in a wallet.
- Prepare the pitch materials: architecture diagram, one-pager, and the honest caveats (what's real vs. what's mocked for the demo).
**Done when:** you can run the full demo start to finish, live, in under 5 minutes, without narrating around a broken step.

---

## Realistic Sequencing Note

If time is tight before demo day, the order above is also the priority order — Phases 0–3 and 6 are the non-negotiable core that proves the actual thesis (compiled workflow + independent verification). Phases 4, 5, and 7 add real depth and "wow," but a working, honest version of Phases 0–3 plus 6 is a stronger demo than a broken version of everything.
