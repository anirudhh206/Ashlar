use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
#[instruction(workflow_id: u64)]
pub struct InitializeWorkflow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + WorkflowInstance::INIT_SPACE,
        seeds = [WORKFLOW_SEED, owner.key().as_ref(), &workflow_id.to_le_bytes()],
        bump
    )]
    pub workflow: Account<'info, WorkflowInstance>,
    #[account(
        init,
        payer = owner,
        space = 8 + Ledger::INIT_SPACE,
        seeds = [LEDGER_SEED, workflow.key().as_ref()],
        bump
    )]
    pub ledger: Account<'info, Ledger>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_workflow(
    ctx: Context<InitializeWorkflow>,
    workflow_id: u64,
    workflow_type: WorkflowType,
    spend_cap: u64,
    allowlist: Vec<Pubkey>,
) -> Result<()> {
    require!(allowlist.len() <= MAX_ALLOWLIST, ErrorCode::AllowlistTooLarge);

    let steps = match workflow_type {
        WorkflowType::RecurringConditionalPayment => vec![
            StepKind::Fetch,
            StepKind::ComplianceCheck,
            StepKind::GuardrailCheck,
            StepKind::MockSettlement,
        ],
        WorkflowType::OneTimeApprovalGatedTransfer => vec![
            StepKind::Fetch,
            StepKind::ManualApproval,
            StepKind::GuardrailCheck,
            StepKind::MockSettlement,
        ],
    };

    let workflow = &mut ctx.accounts.workflow;
    workflow.owner = ctx.accounts.owner.key();
    workflow.workflow_id = workflow_id;
    workflow.workflow_type = workflow_type;
    workflow.steps = steps;
    workflow.current_step = 0;
    workflow.status = WorkflowStatus::InProgress;
    workflow.spend_cap = spend_cap;
    workflow.allowlist = allowlist;
    workflow.pending_amount = 0;
    workflow.pending_recipient = Pubkey::default();
    workflow.bump = ctx.bumps.workflow;

    ctx.accounts.ledger.workflow = workflow.key();
    ctx.accounts.ledger.entries = Vec::new();

    msg!(
        "Workflow {} initialized ({:?}), spend cap {} lamports",
        workflow_id,
        workflow.workflow_type,
        spend_cap
    );
    Ok(())
}
