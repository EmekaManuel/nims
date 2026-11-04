/**
 * Saving the live game to a JSON file. Written atomically (temp file, then rename) so a crash
 * mid-save can never leave a half-written file. The file holds player emails, so it is mode 0600
 * and lives under server/data, which is gitignored.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Game } from './game';

export function saveGame(game: Game, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(game.snapshot()), { mode: 0o600 });
  renameSync(tmp, file);
}

/** Returns the saved game, or null if there is none or it can't be read. A bad file is kept as .bad, never deleted. */
export function loadGame(file: string, log: (msg: string) => void = console.warn): Game | null {
  if (!existsSync(file)) return null;
  try {
    return Game.restore(JSON.parse(readFileSync(file, 'utf8')));
  } catch (e) {
    const bad = `${file}.bad`;
    try {
      renameSync(file, bad);
    } catch {
      /* nothing more we can do */
    }
    log(`Could not read the saved game (${(e as Error).message}). Starting fresh; the old file is at ${bad}.`);
    return null;
  }
}
