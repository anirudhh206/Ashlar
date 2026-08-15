use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct ResumeAfterOverride<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        seeds = [WORKFLOW_SEED, owner.key().as_ref(), &workflow_id.to_le_bytes()],
        bump = workflow.bump,
    )]
    pub workflow: Account<'info, WorkflowInstance>,
    // Not `init` — this amends the existing Failed attestation guardrail_check already wrote at
    // this same step index (the guardrail step, paused rather than advanced), rather than
    // creating a 5th attestation slot for a workflow whose accounts are all sized for exactly 4.
    #[account(
        mut,
        seeds = [ATTESTATION_SEED, workflow.key().as_ref(), &[workflow.current_step]],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut, seeds = [LEDGER_SEED, workflow.key().as_ref()], bump)]
    pub ledger: Account<'info, Ledger>,
}

/// Owner-signed only (`has_one = owner`) — this signature *is* the "manual signature" required
/// before a paused, over-cap workflow can resume. The agent has no tool for this instruction; it
/// is only ever called directly by the Business Owner running `pnpm resume-workflow`.
pub fn handle_resume_after_override(
    ctx: Context<ResumeAfterOverride>,
    _workflow_id: u64,
    approved: bool,
) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::PendingOverrideApproval,
        ErrorCode::NotPendingOverride
    );

    let clock = Clock::get()?;
    let step_index = workflow.current_step;
    let outcome = if approved {
        AttestationOutcome::Passed
    } else {
        AttestationOutcome::Failed
    };

    let attestation = &mut ctx.accounts.attestation;
    attestation.executed_by = ctx.accounts.owner.key();
    attestation.timestamp = clock.unix_timestamp;
    attestation.outcome = outcome;
    attestation.data_hash = solana_keccak_hasher::hash(&[approved as u8, b'o', b'v', b'r']).to_bytes();

    if let Some(entry) = ctx
        .accounts
        .ledger
        .entries
        .iter_mut()
        .find(|entry| entry.step_index == step_index)
    {
        entry.outcome = outcome;
        entry.timestamp = clock.unix_timestamp;
    }

    if approved {
        workflow.status = WorkflowStatus::InProgress;
        workflow.current_step += 1;
        msg!("Workflow resumed by owner override at step {}", step_index);
    } else {
        workflow.status = WorkflowStatus::Rejected;
        msg!("Owner declined the override — workflow stays rejected");
    }
    Ok(())
}
