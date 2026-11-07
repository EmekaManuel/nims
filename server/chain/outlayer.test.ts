import { describe, expect, it } from 'vitest';
import { OutLayerError, outlayer, registerWallet } from './outlayer';

type Call = { url: string; init?: RequestInit };
function fakeFetch(replies: { status?: number; body?: unknown; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('OutLayer client', () => {
  it('registers a wallet with no key, and returns the key once', async () => {
    const { f, calls } = fakeFetch([{ body: { api_key: 'wk_secret', near_account_id: 'abc123', handoff_url: 'https://x/y' } }]);
    const w = await registerWallet('https://testnet-api.outlayer.ai', f);
    expect(w).toEqual({ apiKey: 'wk_secret', accountId: 'abc123', handoffUrl: 'https://x/y' });
    expect(calls[0].url).toBe('https://testnet-api.outlayer.ai/register');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it('sends the key as a bearer token and calls a contract with the documented body', async () => {
    const { f, calls } = fakeFetch([{ body: { tx_hash: 'H' } }]);
    const ol = outlayer({ apiKey: 'wk_secret', fetch: f });
    await ol.call('dao.testnet', 'act_proposal', { id: 3, action: 'VoteApprove' }, '0');
    expect(calls[0].url).toBe('https://testnet-api.outlayer.ai/wallet/v1/call');
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer wk_secret');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ receiver_id: 'dao.testnet', method_name: 'act_proposal', args: { id: 3, action: 'VoteApprove' }, deposit: '0' });
  });

  it('reads the address whichever field the service uses', async () => {
    for (const body of [{ address: 'a1' }, { account_id: 'a1' }, { near_account_id: 'a1' }]) {
      expect(await outlayer({ apiKey: 'k', fetch: fakeFetch([{ body }]).f }).address()).toBe('a1');
    }
    await expect(outlayer({ apiKey: 'k', fetch: fakeFetch([{ body: {} }]).f }).address()).rejects.toBeInstanceOf(OutLayerError);
  });

  it('tells a reverted on-chain call (do not retry blindly) from a rate limit (wait, then retry)', async () => {
    const reverted = await outlayer({ apiKey: 'k', fetch: fakeFetch([{ status: 422, body: { error: 'onchain_tx_failed', tx_hash: 'H' } }]).f }).call('d', 'm', {}).catch((e) => e);
    expect(reverted).toMatchObject({ status: 422, code: 'onchain_tx_failed', onChain: true });
    const limited = await outlayer({ apiKey: 'k', fetch: fakeFetch([{ status: 429, body: { error: 'operation_limit_reached', retry_after_seconds: 120 } }]).f }).call('d', 'm', {}).catch((e) => e);
    expect(limited).toMatchObject({ status: 429, retryAfter: 120, onChain: false });
  });

  it('never puts the API key in an error message', async () => {
    const e = await outlayer({ apiKey: 'wk_topsecret', fetch: fakeFetch([{ status: 500, body: { error: 'boom' } }]).f }).balance().catch((x) => x);
    expect(String(e.message)).not.toContain('wk_topsecret');
  });
});
