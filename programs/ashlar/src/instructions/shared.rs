use anchor_lang::prelude::*;

use crate::state::{Attestation, AttestationOutcome, Ledger, LedgerEntry, StepKind};

/// Writes the Attestation PDA for this step and appends the corresponding row to the
/// workflow's Ledger. Shared by every step instruction (fetch, compliance/approval,
/// guardrail, settlement) so attestation/ledger bookkeeping isn't duplicated per instruction.
#[allow(clippy::too_many_arguments)]
pub fn attest_and_log(
    attestation: &mut Attestation,
    ledger: &mut Ledger,
    workflow: Pubkey,
    step_index: u8,
    step_kind: StepKind,
    executed_by: Pubkey,
    outcome: AttestationOutcome,
    data: &[u8],
    timestamp: i64,
) -> Result<()> {
    attestation.workflow = workflow;
    attestation.step_index = step_index;
    attestation.step_kind = step_kind;
    attestation.executed_by = executed_by;
    attestation.timestamp = timestamp;
    attestation.outcome = outcome;
    attestation.data_hash = solana_keccak_hasher::hash(data).to_bytes();

    ledger.entries.push(LedgerEntry {
        step_index,
        step_kind,
        outcome,
        timestamp,
    });

    Ok(())
}
