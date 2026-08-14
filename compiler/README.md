# @ashlar/compiler

Turns a plain-English instruction (e.g. *"pay every approved invoice every Friday"*)
into a fixed, ordered step sequence — the artifact that gets deployed to the on-chain Policy Engine.

Matching is deterministic keyword/regex matching against a small set of workflow templates, not an
LLM call: the same instruction always compiles to the exact same step sequence. This is what makes
the compiled output trustworthy as a "fixed, not improvised" program in later phases.

## Usage

```ts
import { compileInstruction } from '@ashlar/compiler';

const workflow = compileInstruction(
  'Pay every approved invoice every Friday, up to $500 per payment, to allowlisted vendors.',
);
// workflow.workflowType === 'recurring-conditional-payment'
// workflow.steps === [fetch, compliance_check, guardrail_check, settlement, attestation, ledger_write]
```

## Templates

### `recurring-conditional-payment`
Recognized when the instruction contains a recurrence cue (`every`, `recurring`, `weekly`) and a
payment cue (`pay`, `payment`, `invoice`).

Required cues:
- a weekday: `every <monday..sunday>`
- a spend cap: `up to $<amount>` or `capped at $<amount>`

Optional cues (default if absent): a condition (`approved invoice` → `status == approved`), an
allowlist marker (`allowlisted vendors` / `approved vendors`).

### `one-time-approval-gated-transfer`
Recognized when the instruction contains an approval cue (`pending`/`requires`/`subject to`
`... approval`) and a transfer cue (`transfer`, `send`, `pay`).

Required cue: `$<amount> to <recipient>`.

## Grammar limitations

This is intentionally not full NLP. Instructions outside the recognized cues above will throw a
clear error rather than silently misparse — see `compileInstruction`'s error message for the list
of recognized workflow types.

**Status: implemented (Phase 1).**
