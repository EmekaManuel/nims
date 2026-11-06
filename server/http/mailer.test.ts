import { describe, expect, it } from 'vitest';
import { resendMailer } from './mailer';

describe('resendMailer', () => {
  it('posts the link to the recipient with the key', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const m = resendMailer('k', 'Nims <a@b.c>', (async (url: string, init: RequestInit) => { seen = { url, init }; return { ok: true, status: 200 }; }) as never);
    await m.sendLoginLink('me@x.io', 'https://nims.app/auth/verify?token=t');
    const body = JSON.parse(String(seen!.init.body));
    expect(body.to).toEqual(['me@x.io']);
    expect(body.text).toContain('https://nims.app/auth/verify?token=t');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });
  it('fails loudly when the provider refuses', async () => {
    const m = resendMailer('k', 'f', (async () => ({ ok: false, status: 403 })) as never);
    await expect(m.sendLoginLink('me@x.io', 'l')).rejects.toThrow(/403/);
  });
});
