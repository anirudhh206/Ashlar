/**
 * Independent read-only chain client for the Verifier. Deliberately does NOT import from
 * scripts/lib/ — the point of "zero trust in Ashlar's own systems" is that this package
 * re-derives PDAs and re-reads accounts itself, using only the public Anchor IDL and
 * third-party, independently-auditable libraries (@solana/web3.js, @anchor-lang/core). It never
 * signs or sends a transaction — only reads.
 */
import { Program, AnchorProvider, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IDL_PATH = path.join(REPO_ROOT, 'target', 'idl', 'ashlar.json');

// Same seeds as programs/ashlar/src/constants.rs — re-declared here, not imported from
// scripts/lib, so this package has no dependency on the app's own client code being correct.
const WORKFLOW_SEED = Buffer.from('workflow');
const ATTESTATION_SEED = Buffer.from('attestation');
const LEDGER_SEED = Buffer.from('ledger');

const DEFAULT_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';

export interface ChainClient {
  connection: Connection;
  program: Program;
  programId: PublicKey;
}

/** Builds a read-only Program: a throwaway Keypair-backed provider that never signs or sends —
 * only used to satisfy Anchor's Program constructor and get access to its IDL-based coder. */
export function loadChainClient(rpcUrl: string = DEFAULT_RPC_URL): ChainClient {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const connection = new Connection(rpcUrl, 'confirmed');
  const throwaway = Keypair.generate();
  const provider = new AnchorProvider(connection, new Wallet(throwaway), { commitment: 'confirmed' });
  const program = new Program(idl, provider);
  return { connection, program, programId: new PublicKey(idl.address) };
}

export interface WorkflowPdas {
  workflow: PublicKey;
  ledger: PublicKey;
  attestationPda(stepIndex: number): PublicKey;
}

export function deriveWorkflowPdas(programId: PublicKey, owner: PublicKey, workflowId: bigint): WorkflowPdas {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(workflowId);

  const [workflow] = PublicKey.findProgramAddressSync(
    [WORKFLOW_SEED, owner.toBuffer(), idBuf],
    programId,
  );
  const [ledger] = PublicKey.findProgramAddressSync([LEDGER_SEED, workflow.toBuffer()], programId);
  function attestationPda(stepIndex: number): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [ATTESTATION_SEED, workflow.toBuffer(), Buffer.from([stepIndex])],
      programId,
    );
    return pda;
  }
  return { workflow, ledger, attestationPda };
}

// Program is untyped here (no generated Ashlar IDL type — see the file header on why), so
// `.account` is a plain index-accessed runtime namespace; the returned shape is deliberately
// `any` and read defensively by callers, same as decoded instruction data in verifyWorkflow.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchWorkflowInstance(client: ChainClient, workflow: PublicKey): Promise<any> {
  return (client.program.account as any)['workflowInstance'].fetch(workflow);
}

export async function fetchLedger(client: ChainClient, ledger: PublicKey): Promise<any> {
  return (client.program.account as any)['ledger'].fetch(ledger);
}

export async function fetchAttestation(client: ChainClient, attestation: PublicKey): Promise<any> {
  return (client.program.account as any)['attestation'].fetch(attestation);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function explorerLink(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
