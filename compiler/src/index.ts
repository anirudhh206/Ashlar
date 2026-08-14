/**
 * Phase 1 — The Compiler (Instruction → Program).
 *
 * Turns a plain-English instruction into a fixed step sequence: matches the
 * instruction against a small set of workflow templates (recurring conditional
 * payment, one-time approval-gated transfer), extracts parameters, and
 * generates the ordered instruction list that gets deployed to the on-chain
 * Policy Engine in Phase 2.
 *
 * Matching is deterministic keyword/regex matching, not an LLM call: the same
 * instruction always compiles to the exact same step sequence.
 */
import { templates } from './templates/index.js';
import type { CompiledWorkflow } from './types.js';

export * from './types.js';

export function compileInstruction(instruction: string): CompiledWorkflow {
  const template = templates.find((t) => t.match(instruction));
  if (!template) {
    const recognized = templates.map((t) => t.id).join(', ');
    throw new Error(
      `compileInstruction: no template matched instruction "${instruction}". ` +
        `Recognized workflow types: ${recognized}. See compiler/README.md for the supported grammar.`,
    );
  }

  const params = template.extractParams(instruction);
  const steps = template.buildSteps(params as never);

  return {
    workflowType: template.id,
    parameters: params,
    steps,
  } as CompiledWorkflow;
}
