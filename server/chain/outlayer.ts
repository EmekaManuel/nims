/**
 * OutLayer agent custody: a NEAR wallet whose private key lives inside a secure enclave (TEE). The server
 * only ever holds an API key; OutLayer signs and broadcasts, and enforces the wallet's policy (which
 * contracts it may call, how much it may spend) before every signature. Docs: https://app.outlayer.ai/docs/agent-custody
 *
 * Testnet and mainnet differ only by base URL. This file is a small typed client with an injectable fetch,
 * so tests never touch the network. The API key is a secret: it is never logged and never put in an error.
 */
export const OUTLAYER_TESTNET = 'https://testnet-api.outlayer.ai';

export class OutLayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** Seconds the service asked us to wait (rate limit). */
    readonly retryAfter?: number,
    /** The transaction reached the chain and reverted: it is already on chain, so retrying means paying again. */
    readonly onChain = false,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;
export interface OutLayerOptions { apiKey: string; baseUrl?: string; fetch?: Fetch }

export interface Wallet {
  apiKey: string;
  accountId: string;
  /** Where the wallet's owner sets its policy in a browser. */
  handoffUrl?: string;
}

/** Create a new wallet. The API key in the reply is shown once: the caller must keep it. */
export async function registerWallet(baseUrl = OUTLAYER_TESTNET, f: Fetch = fetch): Promise<Wallet> {
  const res = await f(`${baseUrl}/register`, { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as { api_key?: string; near_account_id?: string; handoff_url?: string };
  if (!res.ok || !body.api_key || !body.near_account_id) throw new OutLayerError(`OutLayer register failed (HTTP ${res.status})`, res.status);
  return { apiKey: body.api_key, accountId: body.near_account_id, handoffUrl: body.handoff_url };
}

export function outlayer(o: OutLayerOptions) {
  const base = (o.baseUrl ?? OUTLAYER_TESTNET).replace(/\/+$/, '');
  const f = o.fetch ?? fetch;

  async function req<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await f(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${o.apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* a non-JSON error page: fall through with no fields */ }
    if (!res.ok) {
      const code = typeof json.error === 'string' ? json.error : undefined;
      const retry = Number(json.retry_after_seconds ?? res.headers?.get?.('Retry-After') ?? NaN);
      throw new OutLayerError(`OutLayer ${method} ${path} failed: HTTP ${res.status}${code ? ` ${code}` : ''}`, res.status, code, Number.isFinite(retry) ? retry : undefined, code === 'onchain_tx_failed');
    }
    return json as T;
  }

  return {
    /** The wallet's NEAR account id. */
    async address(): Promise<string> {
      const r = await req<{ address?: string; account_id?: string; near_account_id?: string }>('GET', '/wallet/v1/address?chain=near');
      const a = r.address ?? r.account_id ?? r.near_account_id;
      if (!a) throw new OutLayerError('OutLayer returned no address', 200);
      return a;
    },
    balance: () => req<Record<string, unknown>>('GET', '/wallet/v1/balance?chain=near'),
    policy: () => req<Record<string, unknown>>('GET', '/wallet/v1/policy'),
    /** Call a contract function. `deposit` is yoctoNEAR as a string. The enclave signs; OutLayer broadcasts. */
    call: (receiverId: string, methodName: string, args: unknown, deposit = '0') =>
      req<Record<string, unknown>>('POST', '/wallet/v1/call', { receiver_id: receiverId, method_name: methodName, args, deposit }),
  };
}
export type OutLayerClient = ReturnType<typeof outlayer>;
