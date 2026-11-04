/** Sends the passwordless login link by email through Resend's HTTP API (no SDK needed). */
import type { Mailer } from './api';

export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async sendLoginLink(email, link) {
      const r = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Your Nims sign-in link',
          text: `Welcome to Nims.\n\nOpen this link to step into the market. It works once and expires in 15 minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
        }),
      });
      if (!r.ok) throw new Error(`Email provider refused the message (${r.status}).`);
    },
  };
}
