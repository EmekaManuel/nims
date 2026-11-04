/**
 * Invisible NEAR accounts. Each player gets an account derived from their email and a key
 * the server holds, encrypted at rest. The player never sees either (CLAUDE.md: no wallet UX).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { KeyPair } from 'near-api-js';
import { decrypt, encrypt, hmacHex } from './crypto';
import { normaliseEmail } from './auth';

export interface PlayerAccount {
  /** Opaque to the player, e.g. "p-3fa91c0b7d2e.oja-items.testnet". Not derived from the email in a reversible way. */
  accountId: string;
  publicKey: string;
  /** AES-GCM encrypted ed25519 secret key. */
  encryptedSecret: string;
  onChain: boolean;
}

/** Deterministic, non-reversible account id: HMAC(email) so the id doesn't leak or link the email. */
export function accountIdFor(email: string, parent: string, secretHex: string): string {
  return `p-${hmacHex(`acct:${normaliseEmail(email)}`, secretHex).slice(0, 12)}.${parent}`;
}

/** Tiny JSON-file store (fine for a testnet game server). */
export class AccountStore {
  private data: Record<string, PlayerAccount> = {};

  constructor(
    private file: string,
    private parent: string,
    private masterKeyHex: string,
  ) {
    if (existsSync(file)) this.data = JSON.parse(readFileSync(file, 'utf8'));
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  /** Get this player's account, generating the key pair the first time they log in. */
  getOrCreate(email: string): PlayerAccount {
    const key = normaliseEmail(email);
    const existing = this.data[key];
    if (existing) return existing;
    const kp = KeyPair.fromRandom('ed25519');
    const acct: PlayerAccount = {
      accountId: accountIdFor(key, this.parent, this.masterKeyHex),
      publicKey: kp.getPublicKey().toString(),
      encryptedSecret: encrypt(kp.toString(), this.masterKeyHex),
      onChain: false,
    };
    this.data[key] = acct;
    this.save();
    return acct;
  }

  markOnChain(email: string) {
    const a = this.data[normaliseEmail(email)];
    if (a) {
      a.onChain = true;
      this.save();
    }
  }

  /** Server-side only: the secret key used to sign this player's actions. */
  secretKeyOf(email: string): string {
    const a = this.data[normaliseEmail(email)];
    if (!a) throw new Error('Unknown player');
    return decrypt(a.encryptedSecret, this.masterKeyHex);
  }
}
