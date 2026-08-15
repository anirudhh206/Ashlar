# @ashlar/dashboard

Live public dashboard that streams step attestations in real time as they land on-chain. Gives an
outside observer a live view of a workflow's proof chain without needing to run
`@ashlar/verifier` themselves.

## Architecture

Two pieces, deliberately split so the Helius API key never reaches a browser:

- **`server/relay.ts`** — a small Node relay (plain `node:http`, no server framework). Holds the
  Helius/devnet RPC connection server-side, subscribes to `Attestation` account changes via
  `connection.onProgramAccountChange` (filtered server-side to just `Attestation` accounts via
  the Anchor account discriminator), and pushes sanitized JSON events to connected browsers over
  **Server-Sent Events**. Also serves `GET /workflow/:pubkey` for an initial snapshot.
- **`src/`** — a React + Vite frontend. Talks only to the relay's own `/events` and `/workflow/:id`
  endpoints — it never touches Helius directly and never sees a key.

## Usage

```powershell
# Terminal 1 — the relay (holds the RPC connection + Helius key)
pnpm dashboard-server

# Terminal 2 — the frontend dev server
pnpm --filter @ashlar/dashboard dev
```

Then open the printed Vite URL, paste in a workflow's PDA address, and watch its attestations
appear live as `pnpm deploy-workflow` (or any other client) drives it forward.

## Status: implemented (Phase 6)

Verified against real devnet: a workflow driven through 3 steps while a live SSE connection was
open showed all 3 attestation events arrive within seconds of landing on-chain, sourced only from
the relay's own endpoints.
