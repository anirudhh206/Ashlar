/**
 * The agent's entire action surface. Five Claude tool-use schemas, one read-only and four
 * thin wrappers over a single specific on-chain Policy Engine call each. `workflowId` and
 * `recipient` are bound by `createTools` (the harness), not exposed as LLM-supplied
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
import { mintReceipt, buildReceiptNotification } from '../../scripts/lib/receiptClient.js';
import { notifyOwner } from '../../scripts/lib/notify.js';

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
      "Submits the guardrail check on-chain for this workflow's fixed recipient, with the given amount. The chain enforces the spend cap and allowlist independently of anything you decide here.",
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
      'Executes the final mock settlement on-chain, paying out to this workflow\'s fixed recipient. Only valid once fetch, compliance/approval, and guardrail have all already passed on-chain.',
    input_schema: { type: 'object', properties: {} },
  },
];

export function createToolExecutor(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
  recipient: PublicKey,
) {
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
        const signature = await submitGuardrailCheck(
          ctx,
          workflowId,
          new anchor.BN(Number(input.amount)),
          recipient,
        );
        return { signature, explorer: explorerLink(signature) };
      }
      case 'submit_mock_settlement': {
        // Real fund movement happens here — a Pyth-priced 85/10/5 split across vendor (paid via
        // real x402 rails), tax-reserve, and yield-pool — before mock_settlement attests to it.
        // The harness does this, never the model.
        const pdas = deriveWorkflowPdas(ctx.program.programId, ctx.owner.publicKey, workflowId);
        const workflow = await getWorkflow(ctx, pdas.workflow);
        const { evidence, onChainReference } = await executeSplitSettlement(
          workflowId.toString(),
          workflow.pendingAmount.toNumber(),
          recipient,
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
