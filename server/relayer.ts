/**
 * Relayer: the player never pays gas or sees a prompt.
 *
 *  - Account creation: the relayer account creates the player's NEAR subaccount.
 *  - Actions: the player's (server-held) key signs a NEP-366 delegate action; the relayer
 *    submits it and pays the gas. The player's account only supplies the 1 yoctoNEAR
 *    that mt_transfer requires.
 */
import { Account, actions } from 'near-api-js';
import { connect } from './chain';
import { relayChecked } from './relay';

const GAS = 100_000_000_000_000n; // 100 Tgas
/** Enough for the account to exist and fund thousands of 1-yocto deposits. */
const STARTING_BALANCE = 20_000_000_000_000_000_000_000n; // 0.02 NEAR

/** What the API needs from the chain. Real impl below; tests pass a fake. */
export interface ChainPort {
  createPlayerAccount(accountId: string, publicKey: string): Promise<void>;
  transferItem(from: { accountId: string; secretKey: string }, to: string, tokenId: string, amount: number): Promise<void>;
  itemBalance(accountId: string, tokenId: string): Promise<number>;
}

export function realChain(): ChainPort {
  const { env, account: relayer } = connect();
  return {
    async createPlayerAccount(accountId, publicKey) {
      await relayer.createAccount({ newAccountId: accountId, publicKey, nearToTransfer: STARTING_BALANCE });
    },

    async transferItem(from, to, tokenId, amount) {
      const player = new Account(from.accountId, env.rpcUrl, from.secretKey as `ed25519:${string}`);
      const { signedDelegate } = await player.createSignedMetaTransaction({
        receiverId: env.contractId,
        actions: [
          actions.functionCall(
            'mt_transfer',
            { receiver_id: to, token_id: tokenId, amount: String(amount), memo: 'trade' },
            GAS,
            1n, // 1 yoctoNEAR, required by NEP-245
          ),
        ],
      });
      await relayChecked(relayer, signedDelegate); // the relayer pays the gas; throws if the call failed on chain
    },

    async itemBalance(accountId, tokenId) {
      const r = await relayer.provider.callFunction<string>({
        contractId: env.contractId,
        method: 'mt_balance_of',
        args: { account_id: accountId, token_id: tokenId },
      });
      return Number(r ?? 0);
    },
  };
}
