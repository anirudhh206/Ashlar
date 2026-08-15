# Ashlar Live Demo Runbook

Target: under 5 minutes, start to finish, no narrating around a broken step. Every command below
has been run for real against devnet — nothing here is illustrative pseudocode.

## Pre-flight (do this before the audience arrives, not live)

1. Confirm balances: `solana balance <business-owner-pubkey> --url devnet` and
   `spl-token balance 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --owner <business-owner-pubkey> --url devnet`
   (pubkey is in `wallets/manifest.json`, role `business-owner`).
   Each full settlement costs a few USDC-atomic-units of vendor payment plus rent — leave headroom
   for at least 2 real settlements (the scripted one below plus the guardrail-override one).
2. Start the x402 vendor server in its own terminal: `pnpm x402-vendor-server` — leave it running
   for the whole demo; every settlement call depends on it.
3. Start the dashboard relay + frontend in two more terminals: `pnpm dashboard-server` and
   (from `dashboard/`) `pnpm dev`. Open the Vite dev URL in a browser tab.
4. Open a Solana Explorer tab (devnet cluster) — leave blank, you'll paste a workflow PDA into it
   live.
5. Open Phantom (devnet network selected) to the business-owner wallet, on the "Collectibles" tab
   so the "Ashlar Receipts" collection is one click away.
6. Window layout: terminal (commands) | dashboard tab | Explorer tab | Phantom, all visible or
   one Alt-Tab away — decide before you start, don't hunt for windows live.

## Beat 1 — Live instruction (~45s)

Run, narrating as it prints:

```
pnpm deploy-workflow "Transfer $5 to Acme Corp, pending my approval."
```

Say: "This is a single English sentence. The compiler turns it into a compiled step sequence —
fetch, manual approval, guardrail check, settlement — with no LLM involved in that translation.
Then it walks a real workflow through all four gates on devnet." Let it run to completion
(~15-25s of real transactions). Copy the printed **Workflow PDA** — you'll need it in Beat 2 and 5.

## Beat 2 — Split-screen with Explorer (~30s)

Paste the workflow PDA into the Explorer tab's search box, and the same PDA into the dashboard's
input field. Say: "Same workflow, two independent views — Explorer reading raw account state
directly from the validator, the dashboard streaming the attestation events live over a relay that
never touches a private key." Point out the 4 attestation transactions and the `Completed` status
in both places agreeing.

## Beat 3 — Deliberate guardrail trigger (~90s)

Run a second workflow with an over-cap request, using the deterministic adversarial path (fast,
reliable, no LLM latency to eat into the 5-minute budget). Note this scenario's spend cap is $100
and its oversized request is $1,000 — real devnet USDC, so **reject** it live (safe, moves no
funds) rather than approving it (approving a real $1,000 settlement is out of budget for a demo
wallet — that path is already verified working at demo-safe amounts, see the fallback note below):

```
pnpm adversarial-test oversized-payment
```

Say: "Same on-chain program, but this time the requested amount exceeds the workflow's own
spend cap." Point at the printed on-chain status — `PendingOverrideApproval`, not a hard reject —
and the dashboard tab updating live. Grab the workflow id from the run's log entry (last entry in
`treasury/adversarial-log.json`, field `workflowId`), then resolve it for real:

```
pnpm resume-workflow <workflowId> reject
```

Say: "This only resolves with the *owner's own signature* — the agent that requested the payment
has no override tool at all, approve or reject. It can only ever wait." Show the workflow settle
into terminal `Rejected` on the dashboard.

## Beat 4 — Adversarial injection attempt (~45s)

```
pnpm adversarial-test unapproved-recipient
```

Say: "This tries to pay a wallet that was never on the workflow's allowlist — the exact kind of
thing a compromised or hallucinating agent might attempt." Point at the terminal's PASS line and
the on-chain `Rejected` status appearing on the dashboard in real time. Note explicitly: "Nothing
here is a mock refusal — that's a real transaction landing on a real devnet validator, rejected by
the immutable on-chain program logic, not by any off-chain check."

## Beat 5 — Independent verification, live, by someone else (~45s)

Hand the keyboard (or read the command aloud for someone to type on their own machine, if they
have the repo cloned) to an audience member:

```
pnpm verify <workflowPda-from-Beat-1>
```

Say before they run it: "This tool has never imported a single line of our own client code — it
only trusts the public Anchor IDL and Solana's own transaction history. It re-fetches every
transaction, re-decodes it, and recomputes the hash itself." Let the `OVERALL: PASS` print
uninterrupted — that's the payoff line of the whole demo.

## Beat 6 — cNFT receipt in wallet (~30s)

Switch to Phantom, refresh the Collectibles tab, open the "Ashlar Receipts" collection. Say: "Every
completed workflow — including the one we just walked through — mints a real compressed NFT
receipt into the owner's wallet, with the full settlement evidence in its metadata on permanent
Arweave storage, not a `data:` URI that only renders in our own app."

## Total: ~4.5 minutes of choreographed beats, leaving margin inside the 5-minute target.

## Fallbacks (say these out loud rather than pausing awkwardly)

- **Slow confirmation:** devnet can take up to ~5s per transaction under load — narrate through it
  ("confirming now...") rather than going silent.
- **429 from the RPC:** the client already retries through Helius; if a beat visibly stalls for
  more than ~10s, say "that's devnet rate-limiting, the client retries automatically" and keep
  talking about the next beat's setup while it resolves.
- **Vendor server not running:** any settlement call will hang/fail immediately with a clear
  connection-refused error — this is why it starts in pre-flight, not live.
- **Low balance mid-demo:** `solana balance`/`spl-token balance` from pre-flight step 1; if you're
  below ~2 USDC or ~0.3 SOL, top up before presenting, not during.
- **Asked "does approve also really work?":** yes — already verified live this session at
  demo-safe amounts (a $5 workflow paused and resumed to genuine `Completed` via
  `pnpm resume-workflow <id> approve`, see README's Phase 4 status). It's not re-run live in Beat 3
  only because that specific scenario's oversized amount ($1,000) is bigger than what's worth
  funding for a demo wallet — say this plainly if asked, don't dodge it.
- **Second template, if there's time or a follow-up question:** a real completed
  recurring-conditional-payment workflow already exists
  (`43u2XzFUb2yB32Sd83Qad6d8Sz51L4m5z7Tvc6pVoXN8`) — pull it up in Explorer/`pnpm verify` to show
  the same engine compiling and executing a structurally different workflow (weekly schedule +
  automatic compliance check instead of manual approval), without spending another real
  transaction live.
