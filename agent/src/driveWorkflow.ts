/**
 * Phase 3 — AI Agent Reasoning Layer. Phase 4 adds pause/notify: an over-cap guardrail result
 * pauses the on-chain workflow (`PendingOverrideApproval`) rather than rejecting it, and this
 * loop pages the Business Owner via Telegram and stops. There is deliberately no resume/override
 * tool in ./tools.ts — the model can never un-pause a workflow; only the owner's own signature
 * can, via `pnpm resume-workflow` (see scripts/devnet/resume-workflow.ts).
 *
 * Runs a Claude tool-use loop that drives one compiled workflow from trigger to completion.
 * The model's only affordances are the 5 tools in ./tools.ts — it cannot construct or sign a
 * transaction, only pick a named tool with typed semantic arguments. The actual business-owner
 * signing key lives in the tool executor (via policyEngineClient), never in the model's reach.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as anchor from '@anchor-lang/core';
import {
  loadPolicyEngineContext,
  resolveVendorPubkey,
  deriveWorkflowPdas,
  getWorkflow,
} from '../../scripts/lib/policyEngineClient.js';
import { TOOLS, createToolExecutor } from './tools.js';
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

export async function driveWorkflow(
  workflowIdRaw: string | number,
  invoiceId: number,
  triggerNote?: string,
): Promise<void> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — see .env.example');
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const ctx = await loadPolicyEngineContext();
  const workflowId = new anchor.BN(workflowIdRaw.toString());
  const recipient = resolveVendorPubkey();
  const { workflow: workflowPda } = deriveWorkflowPdas(
    ctx.program.programId,
    ctx.owner.publicKey,
    workflowId,
  );
  const executeTool = createToolExecutor(ctx, workflowId, recipient);

  // triggerNote lets a caller (e.g. scripts/devnet/adversarial-agent-demo.ts) attach extra
  // trigger text — used to test the agent against an injected/manipulated instruction. It's
  // just more untrusted user-role content; the model's tool schemas are what actually bound
  // what it can do, not anything in this message.
  const triggerMessage = `A trigger fired for workflow ${workflowIdRaw.toString()}, invoice ${invoiceId}. Drive it to completion.${triggerNote ? `\n\n${triggerNote}` : ''}`;
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

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      console.log(`[agent] ${textBlock?.text ?? '(no text response)'}`);
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`[agent] calling ${block.name}(${JSON.stringify(block.input)})`);
      const result = await executeTool(block.name, block.input as Record<string, unknown>);
      console.log(`[agent] -> ${JSON.stringify(result)}`);
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
      return;
    }
    if (!('inProgress' in workflowAccount.status)) {
      console.log(`[agent] workflow finished with status ${JSON.stringify(workflowAccount.status)}`);
      return;
    }
  }

  console.log(`[agent] stopped after reaching the ${MAX_TURNS}-turn safety cap`);
}
