# @ashlar/agent

The AI reasoning layer that interprets live triggers and drives a compiled workflow from trigger
to completion — a real Claude tool-use loop (`src/driveWorkflow.ts`), not a mock.

## No signing authority, concretely

The model's entire action surface is the 5 tools in `src/tools.ts`: one read-only invoice lookup,
and four wrappers that each perform exactly one specific on-chain Policy Engine instruction. The
model can only ever emit `{tool_name, tool_input}` matching one of these declared schemas — there
is no tool for constructing or signing an arbitrary transaction, so that output simply isn't
something the model can produce. `workflowId` and the settlement `recipient` are bound by the
harness (`createToolExecutor`) when the trigger fires, not supplied by the model, so it can't even
redirect a call to a different workflow or payout destination.

The business-owner signing key lives in `scripts/lib/policyEngineClient.ts` (loaded from
`wallets/business-owner.json`), used only inside the tool executors — the model never sees it.

## Usage

```powershell
# One-off: initialize a fresh workflow and let the agent drive it to completion
pnpm agent-demo ["<instruction>"] [invoiceId]

# Or: run the trigger server, then POST to it (real Helius webhook or scripts/devnet/scheduled-trigger.ts)
pnpm agent-server
pnpm scheduled-trigger <workflowId> <invoiceId>
```

Requires `ANTHROPIC_API_KEY` (see `.env.example`) to run the agent loop, and
`HELIUS_WEBHOOK_SECRET` to run the trigger server.

## Wiring a real Helius webhook

`agent/src/server.ts` exposes `POST /trigger` — the same endpoint serves both a real Helius
webhook (event-driven) and `scripts/devnet/scheduled-trigger.ts` (calendar-driven, since Helius
webhooks can't produce a "every Friday" cadence). To register a real webhook: run
`pnpm agent-server`, expose it via a public tunnel (e.g. `ngrok http 8787`), then in the Helius
dashboard create a webhook pointed at `<tunnel-url>/trigger` with a custom Authorization header
`Bearer <HELIUS_WEBHOOK_SECRET>`. This registration step is manual/human — it needs a live tunnel
URL and dashboard access, so it isn't automated here.

**Status: implemented (Phase 3).**
