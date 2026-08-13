/**
 * Phase 1 — The Compiler (Instruction → Program).
 *
 * Turns a plain-English or structured instruction into a fixed step sequence:
 * matches the instruction against a small set of workflow templates (recurring
 * conditional payment, one-time approval-gated transfer), extracts parameters
 * (frequency, spend cap, allowlist, recipient rules), and generates the ordered
 * instruction list that gets deployed to the on-chain Policy Engine in Phase 2.
 *
 * Status: not yet implemented (Phase 1).
 */
export function compileInstruction(_instruction: string): never {
  throw new Error('compileInstruction is not yet implemented (Phase 1)');
}
