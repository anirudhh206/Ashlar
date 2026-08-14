use anchor_lang::prelude::*;

use super::shared::attest_and_log;
use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct ComplianceCheck<'info> {
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

pub fn handle_compliance_check(ctx: Context<ComplianceCheck>, _workflow_id: u64, approved: bool) -> Result<()> {
    let workflow = &mut ctx.accounts.workflow;
    require!(
        workflow.status == WorkflowStatus::InProgress,
        ErrorCode::WorkflowNotInProgress
    );
    require!(
        workflow.steps.get(workflow.current_step as usize) == Some(&StepKind::ComplianceCheck),
        ErrorCode::OutOfOrderStep
    );

    let clock = Clock::get()?;
    let outcome = if approved {
        AttestationOutcome::Passed
    } else {
        AttestationOutcome::Failed
    };

    attest_and_log(
        &mut ctx.accounts.attestation,
        &mut ctx.accounts.ledger,
        workflow.key(),
        workflow.current_step,
        StepKind::ComplianceCheck,
        ctx.accounts.owner.key(),
        outcome,
        &[approved as u8],
        clock.unix_timestamp,
    )?;

    if approved {
        workflow.current_step += 1;
        msg!("Compliance check passed");
    } else {
        workflow.status = WorkflowStatus::Rejected;
        msg!("Compliance check failed: invoice not approved");
    }
    Ok(())
}
