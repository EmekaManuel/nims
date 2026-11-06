import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecrets } from './secrets';
import { offlineChain } from '../chain/relayer';
import { randomHex } from './crypto';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'oja-sec-')), 'dev-secrets.json');

describe('secrets', () => {
  it('uses the environment when both secrets are set, and writes nothing', () => {
    const file = tmp();
    const env = { MASTER_KEY: randomHex(32), SESSION_SECRET: randomHex(32) };
    const s = loadSecrets(env, file);
    expect(s).toMatchObject({ masterKey: env.MASTER_KEY, sessionSecret: env.SESSION_SECRET, generated: false });
    expect(existsSync(file)).toBe(false);
  });

  it('makes private development secrets on a first run, and keeps them so sessions survive restarts', () => {
    const file = tmp();
    const a = loadSecrets({}, file);
    expect(a.generated).toBe(true);
    expect(a.masterKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a.masterKey).not.toBe(a.sessionSecret);
    expect(statSync(file).mode & 0o777).toBe(0o600); // readable only by you
    expect(loadSecrets({}, file)).toEqual(a); // the same ones next time
  });

  it('ignores a half-set or malformed environment instead of using weak secrets', () => {
    const file = tmp();
    const s = loadSecrets({ MASTER_KEY: 'short', SESSION_SECRET: randomHex(32) }, file);
    expect(s.generated).toBe(true);
    expect(s.masterKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('replaces a damaged file rather than crashing', () => {
    const file = tmp();
    writeFileSync(file, '{not json');
    expect(loadSecrets({}, file).generated).toBe(true);
    expect(loadSecrets({}, file).masterKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('offline chain', () => {
  it('accepts everything and settles nothing, so the game never notices', async () => {
    await expect(offlineChain.createPlayerAccount('p-1.oja.testnet', 'ed25519:x')).resolves.toBeUndefined();
    await expect(offlineChain.transferItem({ accountId: 'a', secretKey: 'k' }, 'b', 'iron', 3)).resolves.toBeUndefined();
    await expect(offlineChain.itemBalance('a', 'iron')).resolves.toBe(0);
  });
});
