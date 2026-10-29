import { readFileSync } from 'node:fs';
import { assertAnswersPreserved } from './gate.mjs';
try {
  const before = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const after = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  console.log(JSON.stringify(assertAnswersPreserved(before, after)));
} catch {
  console.error('Rollback verification refused: missing, changed, duplicate or invalid protected-row inventory.');
  process.exitCode = 2;
}
