/**
 * Wallets for merchants and simulated players: a real NEAR account plus an encrypted key.
 * Same machinery as player accounts (server/accounts.ts), keyed by game id instead of email.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { KeyPair } from 'near-api-js';
import { decrypt, encrypt } from './crypto';

interface Wallet {
  accountId: string;
  publicKey: string;
  encryptedSecret: string;
  onChain: boolean;
}

export class WalletStore {
  private data: Record<string, Wallet> = {};

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

  /** e.g. "bisi" -> "bisi.<parent>". Must match accountFor() in settle.ts. */
  accountIdOf = (id: string) => `${id}.${this.parent}`;

  getOrCreate(id: string): Wallet {
    if (this.data[id]) return this.data[id];
    const kp = KeyPair.fromRandom('ed25519');
    this.data[id] = {
      accountId: this.accountIdOf(id),
      publicKey: kp.getPublicKey().toString(),
      encryptedSecret: encrypt(kp.toString(), this.masterKeyHex),
      onChain: false,
    };
    this.save();
    return this.data[id];
  }

  markOnChain(id: string) {
    this.getOrCreate(id).onChain = true;
    this.save();
  }

  secretKeyOf(id: string): string {
    return decrypt(this.getOrCreate(id).encryptedSecret, this.masterKeyHex);
  }
}
