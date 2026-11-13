// The code shown in the video is read from the real files at build time, never retyped.
import { readFileSync, writeFileSync } from 'node:fs';
const take = (file, a, b) => ({ file, from: a, lines: readFileSync(new URL('../../' + file, import.meta.url), 'utf8').split('\n').slice(a - 1, b).map((text, i) => ({ n: a + i, text })) });
const out = { menu: take('sim/plan.ts', 29, 32), rogue: take('server/agents/planner.test.ts', 29, 36) };
writeFileSync(new URL('../public/clips/code.json', import.meta.url), JSON.stringify(out, null, 1));
const tests = readFileSync(new URL('../public/clips/planner-test.txt', import.meta.url), 'utf8').split('\n').filter((l) => /✓|Tests|Test Files/.test(l)).map((l) => l.replace(/^\s+/, '').replace('server/agents/planner.test.ts > ', ''));
writeFileSync(new URL('../public/clips/planner-output.json', import.meta.url), JSON.stringify(tests, null, 1));
console.log('code.json: menu', out.menu.lines.length, 'lines, rogue', out.rogue.lines.length, 'lines; test output', tests.length, 'lines');
