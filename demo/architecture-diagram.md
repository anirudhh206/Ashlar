# Ashlar Architecture

A programmable financial workflow engine: English instructions compile to a fixed, on-chain
gate sequence that an AI agent can *drive* but never *bypass* — settlement authority lives entirely
in an immutable Solana program, not in the model.

```mermaid
flowchart TB
    subgraph off["Off-chain — no signing authority here"]
        instr["English instruction<br/>e.g. \"Transfer $5 to Acme Corp, pending my approval.\""]
        compiler["@ashlar/compiler<br/>rule-based, deterministic<br/>(no LLM in this step)"]
        compiled["CompiledWorkflow<br/>workflowType + steps[] + parameters"]
        agent["Claude tool-use agent<br/>(agent/src/driveWorkflow.ts)<br/>4 narrow typed tools only —<br/>cannot emit raw instructions"]
        trigger["Trigger server<br/>(agent/src/server.ts)<br/>Helius webhook / cron"]
    end

    subgraph chain["On-chain — Solana devnet, Anchor program 'ashlar'"]
        wf["WorkflowInstance PDA<br/>owner, steps[], current_step,<br/>spend_cap, allowlist, status"]
        fetch["fetch_step"]
        gate["compliance_check /<br/>manual_approval"]
        guard["guardrail_check<br/>(spend cap + allowlist —<br/>the ONLY immutable boundary)"]
        settle["mock_settlement"]
        resume["resume_after_override<br/>(owner-signed only)"]
        attest["Attestation PDA per step<br/>keccak256(step data)"]
        ledger["Ledger PDA<br/>running proof trail"]
    end

    subgraph ext["External rails — real, off-chain services"]
        pyth["Pyth Hermes<br/>live USDC/USD price"]
        ap2["AP2 mandate<br/>ed25519-signed JSON"]
        x402["x402 + PayAI facilitator<br/>real USDC vendor payment"]
        mpl["MPL Agent Registry<br/>on-chain agent identity"]
        bubblegum["Metaplex Bubblegum<br/>compressed NFT receipt"]
        irys["Irys / Arweave<br/>permanent metadata"]
        squads["Squads multisig<br/>pooled treasury custody"]
        telegram["Telegram<br/>owner notification"]
    end

    subgraph verify["Independent trust layer — zero shared code with the app"]
        verifier["Verifier CLI<br/>(pnpm verify)<br/>only trusts the public IDL<br/>+ Solana's own tx history"]
        dashboard["Live Dashboard<br/>Node relay + React/SSE<br/>never exposes the RPC key"]
    end

    instr --> compiler --> compiled --> agent
    trigger --> agent
    agent -- "typed tool calls only" --> fetch --> gate --> guard --> settle
    guard -- "over cap" --> resume
    resume -- "owner signature" --> settle
    fetch & gate & guard & settle & resume --> attest --> ledger

    guard -.-> pyth
    settle -.-> ap2
    settle -.-> x402
    settle -.-> squads
    agent -.-> mpl
    settle --> receiptmint["Receipt mint<br/>(post-settlement, client-side)"]
    receiptmint --> bubblegum --> irys
    receiptmint -.-> telegram

    ledger --> verifier
    attest --> dashboard
    wf --> dashboard

    classDef chainStyle fill:#2d3748,stroke:#4a5568,color:#fff
    classDef offStyle fill:#1a365d,stroke:#2c5282,color:#fff
    classDef extStyle fill:#553c1f,stroke:#7c5c2e,color:#fff
    classDef verifyStyle fill:#22543d,stroke:#2f855a,color:#fff
    class wf,fetch,gate,guard,settle,resume,attest,ledger chainStyle
    class instr,compiler,compiled,agent,trigger offStyle
    class pyth,ap2,x402,mpl,bubblegum,irys,squads,telegram,receiptmint extStyle
    class verifier,dashboard verifyStyle
```

## Reading the diagram

- **Blue (off-chain, no signing authority):** everything an attacker or a hallucinating model can
  reach. The compiler is deterministic; the agent's action space is 4 named, schema-constrained
  tools — it can request a step, never construct a transaction.
- **Gray (on-chain, immutable):** the only place spend-cap and allowlist enforcement actually
  lives. `guardrail_check` is the one gate nothing off-chain can talk around — confirmed
  empirically via the adversarial test suite (`pnpm adversarial-test`,
  `pnpm adversarial-agent-demo`).
- **Orange (external rails):** real, live third-party services this project integrates with
  rather than reimplements — Pyth pricing, x402/PayAI for vendor payment, MPL for agent identity,
  Bubblegum/Irys for the receipt, Squads for treasury custody, Telegram for notification.
- **Green (independent trust layer):** deliberately shares zero code with the app above it. The
  verifier only imports the public Anchor IDL and `@solana/web3.js`; the dashboard's relay holds
  the only RPC key and the browser never sees it.

## Why this proves "platform, not app"

The same compiler, the same 5-instruction on-chain program, and the same verifier handle two
structurally different compiled workflows today — `one-time-approval-gated-transfer`
(`[Fetch, ManualApproval, GuardrailCheck, MockSettlement]`) and `recurring-conditional-payment`
(`[Fetch, ComplianceCheck, GuardrailCheck, MockSettlement]`) — from one English sentence each, with
no code path specific to either use case. Both have real, independently-verified completed
settlements on devnet (see `demo/one-pager.md`).
