/**
 * MPL Agent Registry integration (real, not stubbed) — verifies the AI agent has a genuine
 * on-chain identity: an MPL Core NFT asset registered as an `AgentIdentityV1` account via
 * Metaplex's hosted Agent API (`mintAndSubmitAgent`), rather than SAID Protocol (heavier scope —
 * paid verification badges, HMAC messaging infra we don't need — and a less-documented devnet
 * story). Same program/PDA layout on devnet and mainnet.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey, type PublicKey as UmiPublicKey, type Umi } from '@metaplex-foundation/umi';
import {
  mintAndSubmitAgent,
  safeFetchAgentIdentityV1FromSeeds,
  type AgentMetadata,
} from '@metaplex-foundation/mpl-agent-registry';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { DEVNET_URL } from './constants.js';

export function createAgentIdentityUmi(agentKeypair: Keypair): Umi {
  const umi = createUmi(DEVNET_URL);
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(agentKeypair.secretKey);
  return umi.use(keypairIdentity(umiKeypair, true));
}

export interface AgentIdentityRegistration {
  signature: string;
  assetAddress: string;
}

export async function registerAgentIdentity(
  umi: Umi,
  agentMetadata: AgentMetadata,
): Promise<AgentIdentityRegistration> {
  const result = await mintAndSubmitAgent(umi, {}, {
    wallet: umi.identity.publicKey,
    network: 'solana-devnet',
    name: agentMetadata.name,
    uri: `data:application/json;base64,${Buffer.from(JSON.stringify(agentMetadata)).toString('base64')}`,
    agentMetadata,
  });
  return {
    signature: bs58.encode(result.signature),
    assetAddress: result.assetAddress,
  };
}

export interface AgentIdentityStatus {
  registered: boolean;
  assetAddress?: string;
}

/** Reads back the on-chain AgentIdentityV1 account for a given Core asset — the actual
 * verification the agent's own driveWorkflow loop performs at startup. */
export async function verifyAgentIdentity(
  umi: Umi,
  assetAddress: string,
): Promise<AgentIdentityStatus> {
  const asset: UmiPublicKey = publicKey(assetAddress);
  const account = await safeFetchAgentIdentityV1FromSeeds(umi, { asset });
  if (!account) return { registered: false };
  return { registered: true, assetAddress: account.asset.toString() };
}
