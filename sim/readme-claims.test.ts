import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMerchants, harbourMerchants } from './world';

/** The README states how many merchant agents there are. If the world changes, this fails until the README is updated. */
describe('README claims that can drift', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const WORDS: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen' };

  it('states the real number of merchants, and how they split between the town and the harbour', () => {
    const all = createMerchants().length;
    const harbour = harbourMerchants().length;
    const town = all - harbour;
    expect(readme).toContain(`${WORDS[all]} merchant agents** (${WORDS[town].toLowerCase()} in town, ${WORDS[harbour].toLowerCase()} in Saltmere Harbour)`);
    expect(readme).toContain(`A[${all} AI merchants]`);
  });
});
