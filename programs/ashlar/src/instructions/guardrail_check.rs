use anchor_lang::prelude::*;

use super::shared::attest_and_log;
use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct GuardrailCheck<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = owner,
        seeds = [WORKFLOW_SEED, owner.key().as_ref(), &workflow_id.to_le_bytes()],
        bump = workflow.bump,
    )]
    pub workflow: Account<'info, WorkflowInstance>,
    #[account(
        init,
        payer = owner,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [ATTESTATION_SEED, workflow.key().as_ref(), &[workflow.current_step]],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut, seeds = [LEDGER_SEED, workflow.key().as_ref()], bump)]
    pub ledger: Account<'info, Ledger>,
    pub system_program: Program<'info, System>,
}

pub fn handle_guardrail_check(
    ctx: Context<GuardrailCheck>,
    _workflow_id: u64,
    amount: u64,
    recipient: Pubkey,
) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::InProgress,
        ErrorCode::WorkflowNotInProgress
    );
    require!(
        workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::GuardrailCheck),
        ErrorCode::OutOfOrderStep
    );

    let clock = Clock::get()?;
    let mut data = amount.to_le_bytes().to_vec();
    data.extend_from_slice(recipient.as_ref());

    let within_cap = amount <= workflow.spend_cap;
    let allowlisted = workflow.allowlist.is_empty() || workflow.allowlist.contains(&recipient);
    let passed = within_cap && allowlisted;

    attest_and_log(
        &mut ctx.accounts.attestation,
        &mut ctx.accounts.ledger,
        workflow.key(),
        workflow.current_step,
        StepKind::GuardrailCheck,
        ctx.accounts.owner.key(),
        if passed {
            AttestationOutcome::Passed
        } else {
            AttestationOutcome::Failed
        },
        &data,
        clock.unix_timestamp,
    )?;

    // Stored regardless of outcome: an over-cap pause needs these to resume via
    // resume_after_override, since the amount/recipient aren't re-supplied at resume time.
    workflow.pending_amount = amount;
    workflow.pending_recipient = recipient;

    if !within_cap {
        workflow.status = WorkflowStatus::PendingOverrideApproval;
        msg!(
            "Guardrail paused: {} exceeds spend cap {} — awaiting owner override",
            amount,
            workflow.spend_cap
        );
        return Ok(());
    }
    if !allowlisted {
        workflow.status = WorkflowStatus::Rejected;
        msg!("Guardrail rejected: recipient not allowlisted");
        return Ok(());
    }

    workflow.current_step += 1;
    msg!("Guardrail check passed for {} lamports to {}", amount, recipient);
    Ok(())
}
