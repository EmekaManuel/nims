/**
 * Thin NEAR testnet client for the items contract. Reads secrets from .env only.
 * TESTNET ONLY: refuses to run against anything that isn't a *.testnet account / testnet RPC.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Account } from 'near-api-js';
import type { Batch } from './settle';

/** Known testnet RPC hosts. rpc.testnet.near.org is deprecated and rate-limits (429). */
const TESTNET_RPCS = ['test.rpc.fastnear.com', 'rpc.testnet.near.org', 'testnet'];
const GAS = 300_000_000_000_000n; // 300 Tgas
const ONE_YOCTO = 1n;

export interface ChainEnv {
  accountId: string;
  contractId: string;
  /** Namespace for sim accounts, e.g. "bisi.<parent>". */
  parent: string;
  rpcUrl: string;
}

export function loadEnv(): ChainEnv & { privateKey: string } {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing ${k} in .env (see .env.example)`);
    return v;
  };
  const accountId = need('NEAR_ACCOUNT_ID');
  const contractId = process.env.CONTRACT_ID || accountId;
  const rpcUrl = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
  if (!accountId.endsWith('.testnet') || !contractId.endsWith('.testnet') || !TESTNET_RPCS.some((h) => rpcUrl.includes(h))) {
    throw new Error('Refusing to run: Oja only talks to NEAR testnet.');
  }
  return { accountId, contractId, rpcUrl, parent: process.env.ACCOUNT_PARENT || contractId, privateKey: need('NEAR_PRIVATE_KEY') };
}

export function connect() {
  const env = loadEnv();
  const account = new Account(env.accountId, env.rpcUrl, env.privateKey as `ed25519:${string}`);
  return { env, account };
}

/** Deploy the compiled wasm and initialise it with this account as owner and settler. */
export async function deploy(wasmPath = 'contracts/items/target/wasm32-unknown-unknown/release/oja_items.wasm') {
  const { env, account } = connect();
  await account.deployContract(readFileSync(wasmPath));
  await account.callFunction({
    contractId: env.contractId,
    methodName: 'new',
    args: { owner_id: env.accountId, settler_id: env.accountId },
    gas: GAS,
  });
  return env.contractId;
}

/** Submit one batch: mints first, then a single atomic `settle` call. */
export async function submitBatch(b: Batch) {
  const { env, account } = connect();
  for (const m of b.mints) {
    await account.callFunction({
      contractId: env.contractId,
      methodName: 'mint',
      args: { account_id: m.account, token_id: m.tokenId, amount: String(m.amount) },
      gas: GAS,
    });
  }
  if (b.transfers.length) {
    await account.callFunction({
      contractId: env.contractId,
      methodName: 'settle',
      args: {
        transfers: b.transfers.map((t) => ({ from: t.from, to: t.to, token_id: t.tokenId, amount: String(t.amount) })),
      },
      gas: GAS,
    });
  }
}

export async function balanceOf(accountId: string, tokenId: string): Promise<number> {
  const { env, account } = connect();
  const r = await account.provider.callFunction<string>({
    contractId: env.contractId,
    method: 'mt_balance_of',
    args: { account_id: accountId, token_id: tokenId },
  });
  return Number(r ?? 0);
}

export { ONE_YOCTO };
