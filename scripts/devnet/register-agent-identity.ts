/**
 * One-time script: registers the `agent-identity` devnet wallet as a real on-chain agent
 * identity via MPL Agent Registry, then reads it back to confirm. Writes the resulting Core
 * asset address to treasury/agent-identity.json (tracked in git, pubkeys only) so
 * driveWorkflow.ts's startup check knows what to verify.
 *
 * Usage: pnpm register-agent-identity
 */
import { Keypair } from '@solana/web3.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAgentIdentityUmi, registerAgentIdentity, verifyAgentIdentity } from '../lib/agentIdentityClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WALLET_PATH = path.join(REPO_ROOT, 'wallets', 'agent-identity.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'treasury', 'agent-identity.json');

async function main(): Promise<void> {
  const secret = JSON.parse(readFileSync(WALLET_PATH, 'utf8')) as number[];
  const agentKeypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const umi = createAgentIdentityUmi(agentKeypair);

  if (existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as { assetAddress: string };
    const status = await verifyAgentIdentity(umi, existing.assetAddress);
    if (status.registered) {
      console.log(`Already registered: ${existing.assetAddress} (use --force logic manually to re-register)`);
      return;
    }
  }

  console.log(`Registering agent identity for ${agentKeypair.publicKey.toBase58()} on devnet...`);
  const registration = await registerAgentIdentity(umi, {
    type: 'agent',
    name: 'Ashlar Workflow Agent',
    description: 'AI reasoning layer driving compiled Ashlar workflows, stripped of signing authority.',
    services: [{ name: 'workflow-driving', endpoint: 'https://ashlar.dev/agent' }],
    registrations: [],
    supportedTrust: [],
  });
  console.log(`Registered. Signature: ${registration.signature}`);
  console.log(`Core asset address: ${registration.assetAddress}`);

  // Immediately after submission the RPC may not have propagated the new account yet —
  // retry the read-back briefly before giving up, rather than reporting a false negative.
  let status = await verifyAgentIdentity(umi, registration.assetAddress);
  for (let attempt = 0; !status.registered && attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = await verifyAgentIdentity(umi, registration.assetAddress);
  }
  console.log('Verified read-back:', status);

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { network: 'devnet', agentWallet: agentKeypair.publicKey.toBase58(), assetAddress: registration.assetAddress },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
