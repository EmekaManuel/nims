/** Chain calls for self-signed settlement: each signer signs; the relayer relays and pays gas. */
import { Account, actions } from 'near-api-js';
import { connect } from './chain';
import type { MintCall, TransferLeg } from './settle';

const GAS = 300_000_000_000_000n;
const STARTING_BALANCE = 20_000_000_000_000_000_000_000n; // 0.02 NEAR

export function agentChain() {
  const { env, account: owner } = connect();
  return {
    contractId: env.contractId,

    async createAccount(accountId: string, publicKey: string) {
      await owner.createAccount({ newAccountId: accountId, publicKey, nearToTransfer: STARTING_BALANCE });
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
            GAS,
            1n,
          ),
        ],
      });
      await owner.relayMetaTransaction(signedDelegate);
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
