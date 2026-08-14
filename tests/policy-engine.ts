import * as anchor from '@anchor-lang/core';
import { Program } from '@anchor-lang/core';
import { readFileSync } from 'node:fs';
import { assert } from 'chai';
import { Ashlar } from '../target/types/ashlar';

describe('policy-engine', () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.ashlar as Program<Ashlar>;
  const owner = (provider.wallet as anchor.Wallet).payer;

  const vendorSecret = JSON.parse(readFileSync('wallets/test-vendor.json', 'utf8')) as number[];
  const vendor = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(vendorSecret));

  let nextWorkflowId = BigInt(Date.now());

  function pdas(workflowId: bigint) {
    const idBuf = Buffer.alloc(8);
    idBuf.writeBigUInt64LE(workflowId);

    const [workflow] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('workflow'), owner.publicKey.toBuffer(), idBuf],
      program.programId,
    );
    const [ledger] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('ledger'), workflow.toBuffer()],
      program.programId,
    );
    const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), workflow.toBuffer()],
      program.programId,
    );
    function attestation(stepIndex: number) {
      const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('attestation'), workflow.toBuffer(), Buffer.from([stepIndex])],
        program.programId,
      );
      return pda;
    }
    return { workflow, ledger, vault, attestation };
  }

  async function initWorkflow(
    workflowType: Record<string, Record<string, never>>,
    spendCap: anchor.BN,
    allowlist: anchor.web3.PublicKey[],
  ) {
    const workflowId = nextWorkflowId++;
    const { workflow, ledger, vault } = pdas(workflowId);
    await program.methods
      .initializeWorkflow(new anchor.BN(workflowId.toString()), workflowType, spendCap, allowlist)
      .accountsPartial({ owner: owner.publicKey, workflow, ledger, vault })
      .rpc();
    return { workflowId, workflow, ledger, vault };
  }

  it('recurring-conditional-payment: happy path through all 4 gates', async () => {
    const spendCap = new anchor.BN(2_000_000);
    const { workflowId, workflow, ledger, vault } = await initWorkflow(
      { recurringConditionalPayment: {} },
      spendCap,
      [vendor.publicKey],
    );
    const idBN = new anchor.BN(workflowId.toString());
    const { attestation } = pdas(workflowId);

    await program.methods
      .fetchStep(idBN, new anchor.BN(1), new anchor.BN(1_000_000))
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(0), ledger })
      .rpc();

    await program.methods
      .complianceCheck(idBN, true)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(1), ledger })
      .rpc();

    await program.methods
      .guardrailCheck(idBN, new anchor.BN(1_000_000), vendor.publicKey)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(2), ledger })
      .rpc();

    await program.methods
      .mockSettlement(idBN)
      .accountsPartial({
        owner: owner.publicKey,
        workflow,
        attestation: attestation(3),
        ledger,
        vault,
        recipient: vendor.publicKey,
      })
      .rpc();

    const workflowAccount = await program.account.workflowInstance.fetch(workflow);
    assert.deepEqual(workflowAccount.status, { completed: {} });
    assert.equal(workflowAccount.currentStep, 4);

    const ledgerAccount = await program.account.ledger.fetch(ledger);
    assert.equal(ledgerAccount.entries.length, 4);
  });

  it('one-time-approval-gated-transfer: happy path through all 4 gates', async () => {
    const spendCap = new anchor.BN(2_000_000);
    const { workflowId, workflow, ledger, vault } = await initWorkflow(
      { oneTimeApprovalGatedTransfer: {} },
      spendCap,
      [vendor.publicKey],
    );
    const idBN = new anchor.BN(workflowId.toString());
    const { attestation } = pdas(workflowId);

    await program.methods
      .fetchStep(idBN, new anchor.BN(2), new anchor.BN(2_000_000))
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(0), ledger })
      .rpc();

    await program.methods
      .manualApproval(idBN, true)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(1), ledger })
      .rpc();

    await program.methods
      .guardrailCheck(idBN, new anchor.BN(2_000_000), vendor.publicKey)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(2), ledger })
      .rpc();

    await program.methods
      .mockSettlement(idBN)
      .accountsPartial({
        owner: owner.publicKey,
        workflow,
        attestation: attestation(3),
        ledger,
        vault,
        recipient: vendor.publicKey,
      })
      .rpc();

    const workflowAccount = await program.account.workflowInstance.fetch(workflow);
    assert.deepEqual(workflowAccount.status, { completed: {} });
  });

  it('guardrail rejects an over-cap amount', async () => {
    const spendCap = new anchor.BN(2_000_000);
    const { workflowId, workflow, ledger } = await initWorkflow(
      { oneTimeApprovalGatedTransfer: {} },
      spendCap,
      [vendor.publicKey],
    );
    const idBN = new anchor.BN(workflowId.toString());
    const { attestation } = pdas(workflowId);

    await program.methods
      .fetchStep(idBN, new anchor.BN(3), new anchor.BN(3_000_000))
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(0), ledger })
      .rpc();
    await program.methods
      .manualApproval(idBN, true)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(1), ledger })
      .rpc();

    // amount (3_000_000) exceeds spend cap (2_000_000)
    await program.methods
      .guardrailCheck(idBN, new anchor.BN(3_000_000), vendor.publicKey)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(2), ledger })
      .rpc();

    const workflowAccount = await program.account.workflowInstance.fetch(workflow);
    assert.deepEqual(workflowAccount.status, { rejected: {} });

    const attestationAccount = await program.account.attestation.fetch(attestation(2));
    assert.deepEqual(attestationAccount.outcome, { failed: {} });
  });

  it('manual approval rejects when denied', async () => {
    const spendCap = new anchor.BN(2_000_000);
    const { workflowId, workflow, ledger } = await initWorkflow(
      { oneTimeApprovalGatedTransfer: {} },
      spendCap,
      [vendor.publicKey],
    );
    const idBN = new anchor.BN(workflowId.toString());
    const { attestation } = pdas(workflowId);

    await program.methods
      .fetchStep(idBN, new anchor.BN(4), new anchor.BN(50_000))
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(0), ledger })
      .rpc();

    await program.methods
      .manualApproval(idBN, false)
      .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(1), ledger })
      .rpc();

    const workflowAccount = await program.account.workflowInstance.fetch(workflow);
    assert.deepEqual(workflowAccount.status, { rejected: {} });
  });

  it('rejects a step called out of order', async () => {
    const spendCap = new anchor.BN(2_000_000);
    const { workflowId, workflow, ledger } = await initWorkflow(
      { oneTimeApprovalGatedTransfer: {} },
      spendCap,
      [vendor.publicKey],
    );
    const idBN = new anchor.BN(workflowId.toString());
    const { attestation } = pdas(workflowId);

    let threw = false;
    try {
      // guardrail_check called before fetch_step / manual_approval
      await program.methods
        .guardrailCheck(idBN, new anchor.BN(50_000), vendor.publicKey)
        .accountsPartial({ owner: owner.publicKey, workflow, attestation: attestation(0), ledger })
        .rpc();
    } catch {
      threw = true;
    }
    assert.isTrue(threw, 'expected out-of-order step call to fail');
  });
});
