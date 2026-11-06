/**
 * Relay a player/merchant-signed delegate action and REPORT what really happened.
 *
 * Why this exists: a delegate action runs as a separate receipt after the relayer's outer
 * transaction. If the inner call fails (overdraw, out of gas) the outer transaction still
 * "succeeds", so a plain relay would let a failed settlement pass silently. We wait for final
 * execution and throw if any receipt failed.
 */
import { actions, Account } from 'near-api-js';

type SignedDelegateLike = { delegateAction: { senderId: string }; signature: unknown };

export function failureOf(res: unknown): string | null {
  const r = res as { status?: Record<string, unknown> | string; receipts_outcome?: { outcome: { status: Record<string, unknown> | string } }[] };
  const all = [r.status, ...(r.receipts_outcome ?? []).map((o) => o.outcome.status)];
  for (const s of all) {
    if (s && typeof s === 'object' && 'Failure' in s) return JSON.stringify((s as { Failure: unknown }).Failure);
  }
  return null;
}

export async function relayChecked(relayer: Account, signedDelegate: SignedDelegateLike): Promise<void> {
  const res = await relayer.signAndSendTransaction({
    receiverId: signedDelegate.delegateAction.senderId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: [actions.signedDelegate(signedDelegate as any)],
    waitUntil: 'FINAL',
  });
  const bad = failureOf(res);
  if (bad) throw new Error(`Settlement failed on chain: ${bad.slice(0, 300)}`);
}
