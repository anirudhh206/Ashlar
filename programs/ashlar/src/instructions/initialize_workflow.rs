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
    /// CHECK: plain lamport vault, funded here and paid out from in `mock_settlement`; holds
    /// no Anchor account data.
    #[account(
        mut,
        seeds = [VAULT_SEED, workflow.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
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

    let cpi_accounts = anchor_lang::system_program::Transfer {
        from: ctx.accounts.owner.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(anchor_lang::system_program::ID, cpi_accounts);
    anchor_lang::system_program::transfer(cpi_ctx, spend_cap)?;

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
    workflow.vault_bump = ctx.bumps.vault;

    ctx.accounts.ledger.workflow = workflow.key();
    ctx.accounts.ledger.entries = Vec::new();

    msg!(
        "Workflow {} initialized ({:?}), vault funded with {} lamports",
        workflow_id,
        workflow.workflow_type,
        spend_cap
    );
    Ok(())
}
