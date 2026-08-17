/**
 * Phase 3 — AI Agent Reasoning Layer. Phase 4 adds pause/notify: an over-cap guardrail result
 * pauses the on-chain workflow (`PendingOverrideApproval`) rather than rejecting it, and this
 * loop pages the Business Owner via Telegram and stops. There is deliberately no resume/override
 * tool in ./tools.ts — the model can never un-pause a workflow; only the owner's own signature
 * can, via `pnpm resume-workflow` (see scripts/devnet/resume-workflow.ts).
 *
 * Runs a Claude tool-use loop that drives one compiled workflow from trigger to completion. The
 * model's only affordances are the 5 tools in ./tools.ts — it cannot construct or sign a
 * transaction, only pick a named tool with typed semantic arguments. The actual business-owner
 * signing key lives in the tool executor (via policyEngineClient), never in the model's reach.
 *
 * `onEvent` is an optional real-time hook (used by dashboard/server/relay.ts's live Agent page to
 * stream this exact loop over SSE) — purely additive, every event that goes to onEvent is also
 * still printed to console, so CLI callers are unaffected.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as anchor from '@anchor-lang/core';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  deriveWorkflowPdas,
  getWorkflow,
} from '../../scripts/lib/policyEngineClient.js';
import { TOOLS, createToolExecutor, type ToolRecipient } from './tools.js';
import { notifyOwner } from '../../scripts/lib/notify.js';

const MAX_TURNS = 10;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are Ashlar's AI reasoning layer for a single compiled financial workflow.
You may ONLY use the tools provided to you — there is no other action available to you, and you
have no ability to sign or construct transactions directly; every tool call results in exactly one
specific, already-defined on-chain instruction. Your job: read the triggered invoice with
get_invoice_data, then drive the workflow through its steps in order by calling
submit_fetch_step, then submit_compliance_or_approval_decision (approve only if the invoice's
status is "approved"), then submit_guardrail_check with the invoice amount, then
submit_mock_settlement. After each tool call, check its result. If a step's on-chain outcome
indicates rejection, stop immediately — do not retry or attempt anything else.`;

export type AgentEvent =
  | { type: 'trigger'; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'paused'; pendingAmount: string; spendCap: string }
  | { type: 'finished'; status: string }
  | { type: 'max_turns' }
  | { type: 'error'; message: string };

export interface DriveWorkflowOptions {
  triggerNote?: string;
  onEvent?: (event: AgentEvent) => void;
  /** Explicit real wallet-address recipient(s) for this trigger, each with its own USD amount —
   * set by the dashboard's Agent page when the operator names real recipients instead of relying
   * on the legacy single-vendor stand-in. Defaults to that legacy stand-in when omitted, so
   * existing CLI/script callers are unaffected. */
  recipients?: ToolRecipient[];
}

export async function driveWorkflow(
  workflowIdRaw: string | number,
  invoiceId: number,
  options: DriveWorkflowOptions = {},
): Promise<void> {
  const { triggerNote, onEvent } = options;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — see .env.example');
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const ctx = await loadPolicyEngineContext();
  const workflowId = new anchor.BN(workflowIdRaw.toString());
  const recipients: ToolRecipient[] = options.recipients?.length
    ? options.recipients
    : [{ pubkey: resolveVendorPubkey() }];
  const { workflow: workflowPda } = deriveWorkflowPdas(
    ctx.program.programId,
    ctx.owner.publicKey,
    workflowId,
  );
  const executeTool = createToolExecutor(ctx, workflowId, recipients);

  // triggerNote lets a caller (e.g. scripts/devnet/adversarial-agent-demo.ts) attach extra
  // trigger text — used to test the agent against an injected/manipulated instruction. It's
  // just more untrusted user-role content; the model's tool schemas are what actually bound
  // what it can do, not anything in this message.
  const triggerMessage = `A trigger fired for workflow ${workflowIdRaw.toString()}, invoice ${invoiceId}. Drive it to completion.${triggerNote ? `\n\n${triggerNote}` : ''}`;
  onEvent?.({ type: 'trigger', message: triggerMessage });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: triggerMessage }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        onEvent?.({ type: 'assistant_text', text: block.text });
      }
    }

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      console.log(`[agent] ${textBlock?.text ?? '(no text response)'}`);
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`[agent] calling ${block.name}(${JSON.stringify(block.input)})`);
      onEvent?.({ type: 'tool_call', name: block.name, input: block.input as Record<string, unknown> });
      const result = await executeTool(block.name, block.input as Record<string, unknown>);
      console.log(`[agent] -> ${JSON.stringify(result)}`);
      onEvent?.({ type: 'tool_result', name: block.name, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });

    const workflowAccount = await getWorkflow(ctx, workflowPda);
    if ('pendingOverrideApproval' in workflowAccount.status) {
      await notifyOwner(
        `Workflow ${workflowIdRaw.toString()} paused: requested $${workflowAccount.pendingAmount.toString()} ` +
          `exceeds the spend cap of $${workflowAccount.spendCap.toString()}. ` +
          `Run \`pnpm resume-workflow ${workflowIdRaw.toString()} approve\` (or \`reject\`) to resolve it.`,
      );
      console.log(`[agent] workflow paused, owner notified — stopping (no override tool available to me)`);
      onEvent?.({
        type: 'paused',
        pendingAmount: workflowAccount.pendingAmount.toString(),
        spendCap: workflowAccount.spendCap.toString(),
      });
      return;
    }
    if (!('inProgress' in workflowAccount.status)) {
      const status = Object.keys(workflowAccount.status as object)[0] ?? 'unknown';
      console.log(`[agent] workflow finished with status ${JSON.stringify(workflowAccount.status)}`);
      onEvent?.({ type: 'finished', status });
      return;
    }
  }

  console.log(`[agent] stopped after reaching the ${MAX_TURNS}-turn safety cap`);
  onEvent?.({ type: 'max_turns' });
}
