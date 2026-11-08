/**
 * Where the two server secrets come from: MASTER_KEY (encrypts player keys) and SESSION_SECRET
 * (signs login links and sessions).
 *
 * Real deployments set both in .env. For a first run with no .env we create random ones and keep
 * them in dev-secrets.json in the data folder (mode 0600, gitignored), beside the save, so sessions and
 * encrypted wallets survive restarts and redeploys, and a reviewer can start the game with zero setup.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomHex } from './crypto';

export interface Secrets {
  masterKey: string;
  sessionSecret: string;
  /** True when these were generated for development rather than provided in the environment. */
  generated: boolean;
}

const isKey = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s);
const clean = (s: string | undefined) => s?.trim();

export function loadSecrets(env: Record<string, string | undefined> = process.env, file = 'server/data/dev-secrets.json'): Secrets {
  const masterKey = clean(env.MASTER_KEY);
  const sessionSecret = clean(env.SESSION_SECRET);
  if (isKey(masterKey) && isKey(sessionSecret)) return { masterKey, sessionSecret, generated: false };
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (isKey(saved.masterKey) && isKey(saved.sessionSecret)) return { ...saved, generated: true };
    } catch {
      /* fall through and make fresh ones */
    }
  }
  const fresh = { masterKey: randomHex(32), sessionSecret: randomHex(32) };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(fresh), { mode: 0o600 });
  return { ...fresh, generated: true };
}
