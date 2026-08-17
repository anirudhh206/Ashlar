/**
 * The agent's entire action surface. Five Claude tool-use schemas, one read-only and four
 * thin wrappers over a single specific on-chain Policy Engine call each. `workflowId` and
 * `recipients` are bound by `createTools` (the harness), not exposed as LLM-supplied
 * arguments — the model can never target a different workflow or a different payout
 * destination than the one this trigger is actually for. Claude's tool-use API only lets the
 * model emit `{tool_name, tool_input}` matching one of these declared schemas: there is no
 * tool here for constructing or signing an arbitrary transaction, so that's simply not
 * something the model's output can ever produce.
 */
import type Anthropic from '@anthropic-ai/sdk';
import * as anchor from '@anchor-lang/core';
import type { PublicKey } from '@solana/web3.js';
import { getMockInvoice } from './mockInvoices.js';
import {
  type PolicyEngineContext,
  deriveWorkflowPdas,
  getWorkflow,
  submitFetchStep,
  submitComplianceOrApprovalDecision,
  submitGuardrailCheck,
  submitMockSettlement,
  explorerLink,
} from '../../scripts/lib/policyEngineClient.js';
import { executeSplitSettlement } from '../../scripts/lib/splitSettlement.js';
import { executeDirectTransfer } from '../../scripts/lib/directTransfer.js';
import { mintReceipt, buildReceiptNotification } from '../../scripts/lib/receiptClient.js';
import { notifyOwner } from '../../scripts/lib/notify.js';

/** A single payout destination bound into the harness for this trigger. `amountUsd` is only
 * present for an explicit multi-recipient (real wallet address) transfer — when absent, this is
 * the legacy single-vendor stand-in path, and the model's own `submit_guardrail_check` amount
 * argument (drawn from the invoice) is what's checked instead. */
export interface ToolRecipient {
  pubkey: PublicKey;
  amountUsd?: number;
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_invoice_data',
    description:
      'Read-only lookup of a mock invoice by id. Does not touch the chain. Use this first to see the amount, vendor, and approval status before deciding what to do.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'integer', description: 'The invoice id to look up.' },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'submit_fetch_step',
    description:
      "Records the fetched invoice on-chain as this workflow's Fetch step. Call this after reading the invoice with get_invoice_data.",
    input_schema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'integer' },
        amount: { type: 'integer', description: 'Invoice amount in USD.' },
      },
      required: ['invoiceId', 'amount'],
    },
  },
  {
    name: 'submit_compliance_or_approval_decision',
    description:
      "Submits this workflow's compliance/approval decision on-chain (the harness picks compliance_check vs manual_approval based on the workflow's own type — you don't need to know which). Base the decision on the invoice's status field.",
    input_schema: {
      type: 'object',
      properties: {
        approved: { type: 'boolean' },
      },
      required: ['approved'],
    },
  },
  {
    name: 'submit_guardrail_check',
    description:
      "Submits the guardrail check on-chain for this workflow's fixed recipient(s), with the given amount. The chain enforces the spend cap and allowlist independently of anything you decide here — for an explicit multi-recipient transfer, the harness ignores this amount in favor of the pre-configured total anyway.",
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'integer', description: 'Amount in USD to check against the spend cap.' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'submit_mock_settlement',
    description:
      "Executes the final mock settlement on-chain, paying out to this workflow's fixed recipient(s). Only valid once fetch, compliance/approval, and guardrail have all already passed on-chain.",
    input_schema: { type: 'object', properties: {} },
  },
];

export function createToolExecutor(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  recipients: ToolRecipient[],
) {
  // An explicit multi-recipient transfer (real wallet addresses entered by the operator, each
  // with its own amount) vs. the legacy single-vendor stand-in path (amount comes from the
  // model's own guardrail-check argument, driven by the invoice).
  const isExplicit = recipients.length > 0 && recipients.every((r) => r.amountUsd !== undefined);
  const primaryRecipient = recipients[0]?.pubkey;
  if (!primaryRecipient) throw new Error('createToolExecutor: at least one recipient is required');
  const explicitTotalUsd = isExplicit
    ? recipients.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0)
    : undefined;

  return async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'get_invoice_data': {
        const invoice = getMockInvoice(Number(input.invoiceId));
        if (!invoice) return { error: `No mock invoice with id ${String(input.invoiceId)}` };
        return invoice;
      }
      case 'submit_fetch_step': {
        const signature = await submitFetchStep(
          ctx,
          workflowId,
          new anchor.BN(Number(input.invoiceId)),
          new anchor.BN(Number(input.amount)),
        );
        return { signature, explorer: explorerLink(signature) };
      }
      case 'submit_compliance_or_approval_decision': {
        const signature = await submitComplianceOrApprovalDecision(
          ctx,
          workflowId,
          Boolean(input.approved),
        );
        return { signature, explorer: explorerLink(signature) };
      }
      case 'submit_guardrail_check': {
        // For an explicit transfer, every recipient must already be on the workflow's real
        // on-chain allowlist (set at init time from the same recipient list) — the single-pubkey
        // on-chain instruction can only check one of them, so the harness checks the rest itself
        // before ever submitting, rather than silently trusting an unchecked destination.
        if (isExplicit && recipients.length > 1) {
          const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
          const workflow = await getWorkflow(ctx, pdas.workflow);
          const allowlist = (workflow.allowlist as PublicKey[]).map((p) => p.toBase58());
          const notAllowlisted = recipients.find((r) => !allowlist.includes(r.pubkey.toBase58()));
          if (notAllowlisted) {
            return { error: `Recipient ${notAllowlisted.pubkey.toBase58()} is not on this workflow's on-chain allowlist` };
          }
        }
        // For an explicit transfer the on-chain spend_cap was itself set to this same total at
        // init time (see deployWorkflow.ts), so this check can never fail by construction — its
        // real value here is that `amount` is harness-computed from the pre-configured recipient
        // list, not read from the model's own tool-call argument, so a manipulated model can't
        // inflate the amount actually checked/settled. The legacy single-vendor path below keeps
        // trusting the model's `amount` argument, which is what the on-chain cap genuinely guards.
        const amount = isExplicit ? new anchor.BN(Math.round(explicitTotalUsd!)) : new anchor.BN(Number(input.amount));
        const signature = await submitGuardrailCheck(ctx, workflowId, amount, primaryRecipient);
        return { signature, explorer: explorerLink(signature) };
      }
      case 'submit_mock_settlement': {
        const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
        const workflow = await getWorkflow(ctx, pdas.workflow);

        if (isExplicit) {
          // Real fund movement happens inside the Solana program itself here — a transfer_checked
          // CPI per real recipient wallet, atomic with the settlement attestation in one
          // transaction. No vendor invoice, no tax/yield skim, and no separate submitMockSettlement
          // call: executeDirectTransfer's on-chain instruction already does both at once.
          const { evidence } = await executeDirectTransfer(
            ctx,
            workflowId,
            recipients.map((r) => ({ pubkey: r.pubkey, amountUsd: r.amountUsd! })),
          );
          const receipt = await mintReceipt(ctx.owner.secretKey, workflowId.toString(), evidence);
          await notifyOwner(buildReceiptNotification(workflowId.toString(), receipt));
          return { signature: evidence.signature, evidence, receipt, explorer: explorerLink(evidence.signature) };
        }

        // Legacy path — a Pyth-priced 85/10/5 split across vendor (paid via real x402 rails),
        // tax-reserve, and yield-pool — before mock_settlement attests to it.
        const { evidence, onChainReference } = await executeSplitSettlement(
          workflowId.toString(),
          workflow.pendingAmount.toNumber(),
          primaryRecipient,
        );
        const signature = await submitMockSettlement(ctx, workflowId, onChainReference);
        const receipt = await mintReceipt(ctx.owner.secretKey, workflowId.toString(), evidence);
        await notifyOwner(buildReceiptNotification(workflowId.toString(), receipt));
        return { signature, evidence, receipt, explorer: explorerLink(signature) };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}
