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

/** Upgrade code only (state is kept, no re-init). */
export async function upgrade(wasmPath = 'contracts/items/target/wasm32-unknown-unknown/release/oja_items.wasm') {
  const { account } = connect();
  await account.deployContract(readFileSync(wasmPath));
}

/** Retry on RPC rate limits (429) with exponential backoff; the free endpoints are strict. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const text = String((e as Error)?.message ?? e) + JSON.stringify((e as { cause?: unknown })?.cause ?? '');
      const limited = /429|ETIMEDOUT|ECONNRESET|fetch failed|timeout/i.test(text);
      if (!limited || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1_000 * 2 ** attempt)));
    }
  }
}

/** One unit of chain work. A batch is its mints followed by one atomic `settle`. */
export type Call = { kind: 'mint'; mints: Batch['mints'] } | { kind: 'settle'; transfers: Batch['transfers'] };

export const callsOf = (b: Batch): Call[] => [
  ...(b.mints.length ? [{ kind: 'mint' as const, mints: b.mints }] : []),
  ...(b.transfers.length ? [{ kind: 'settle' as const, transfers: b.transfers }] : []),
];

export async function submitCall(c: Call) {
  const { env, account } = connect();
  await withRetry(() =>
    c.kind === 'mint'
      ? account.callFunction({
          contractId: env.contractId,
          methodName: 'batch_mint',
          args: { mints: c.mints.map((m) => ({ account_id: m.account, token_id: m.tokenId, amount: String(m.amount) })) },
          gas: GAS,
        })
      : account.callFunction({
          contractId: env.contractId,
          methodName: 'settle',
          args: { transfers: c.transfers.map((t) => ({ from: t.from, to: t.to, token_id: t.tokenId, amount: String(t.amount) })) },
          gas: GAS,
        }),
  );
}

export async function balanceOf(accountId: string, tokenId: string): Promise<number> {
  const { env, account } = connect();
  const r = await withRetry(() =>
    account.provider.callFunction<string>({
      contractId: env.contractId,
      method: 'mt_balance_of',
      args: { account_id: accountId, token_id: tokenId },
    }),
  );
  return Number(r ?? 0);
}

export { ONE_YOCTO };
