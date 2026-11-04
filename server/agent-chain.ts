/** Chain calls for self-signed settlement: each signer signs; the relayer relays and pays gas. */
import { Account, actions } from 'near-api-js';
import { connect } from './chain';
import { relayChecked } from './relay';
import type { MintCall, TransferLeg } from './settle';

const GAS = 300_000_000_000_000n; // owner calls (batch_mint)
const SEND_GAS = 100_000_000_000_000n; // delegate-wrapped calls: the whole tx is capped at 300 Tgas, so keep headroom
const STARTING_BALANCE = 20_000_000_000_000_000_000_000n; // 0.02 NEAR

export function agentChain() {
  const { env, account: owner } = connect();
  return {
    contractId: env.contractId,

    /** Create an account. Must be a subaccount of `creator` (default: the owner). */
    async createAccount(accountId: string, publicKey: string, creator?: { accountId: string; secretKey: string }, fund = STARTING_BALANCE) {
      const parent = creator ? new Account(creator.accountId, env.rpcUrl, creator.secretKey as `ed25519:${string}`) : owner;
      await parent.createAccount({ newAccountId: accountId, publicKey, nearToTransfer: fund });
    },

    /** Items enter the world (owner only). */
    async batchMint(mints: MintCall[]) {
      if (!mints.length) return;
      await owner.callFunction({
        contractId: env.contractId,
        methodName: 'batch_mint',
        args: { mints: mints.map((m) => ({ account_id: m.account, token_id: m.tokenId, amount: String(m.amount) })) },
        gas: GAS,
      });
    },

    /** `signer` signs a send_many with its OWN key; the relayer relays it and pays the gas. */
    async sendMany(signer: { accountId: string; secretKey: string }, legs: TransferLeg[]) {
      const acct = new Account(signer.accountId, env.rpcUrl, signer.secretKey as `ed25519:${string}`);
      const { signedDelegate } = await acct.createSignedMetaTransaction({
        receiverId: env.contractId,
        actions: [
          actions.functionCall(
            'send_many',
            { legs: legs.map((l) => ({ receiver_id: l.to, token_id: l.tokenId, amount: String(l.amount) })) },
            SEND_GAS,
            1n,
          ),
        ],
      });
      await relayChecked(owner, signedDelegate); // throws if the inner call failed
    },

    async balanceOf(accountId: string, tokenId: string): Promise<number> {
      const r = await owner.provider.callFunction<string>({
        contractId: env.contractId,
        method: 'mt_balance_of',
        args: { account_id: accountId, token_id: tokenId },
      });
      return Number(r ?? 0);
    },
  };
}
