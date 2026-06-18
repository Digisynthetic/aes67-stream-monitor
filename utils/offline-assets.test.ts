import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeExternalPatterns = [
  /https:\/\/cdn\.tailwindcss\.com/,
  /https:\/\/esm\.sh/,
  /<script\s+type="importmap"/,
];

test('source html does not depend on remote runtime assets', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  for (const pattern of runtimeExternalPatterns) {
    assert.equal(pattern.test(html), false, `Found runtime external asset reference: ${pattern}`);
  }
});
