/**
 * Where the two server secrets come from: MASTER_KEY (encrypts player keys) and SESSION_SECRET
 * (signs login links and sessions).
 *
 * Real deployments set both in .env. For a first run with no .env we create random ones and keep
 * them in server/data/dev-secrets.json (mode 0600, gitignored), so sessions survive restarts and a
 * reviewer can start the game with zero setup.
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

export function loadSecrets(env: Record<string, string | undefined> = process.env, file = 'server/data/dev-secrets.json'): Secrets {
  if (isKey(env.MASTER_KEY) && isKey(env.SESSION_SECRET)) return { masterKey: env.MASTER_KEY, sessionSecret: env.SESSION_SECRET, generated: false };
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
