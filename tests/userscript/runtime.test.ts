import test from 'node:test';
import assert from 'node:assert/strict';
import { isLivePath } from '../../src/userscript/index.ts';

test('recognizes live stream paths only', () => {
  assert.equal(isLivePath('/live'), true);
  assert.equal(isLivePath('/live/creator-name'), true);
  assert.equal(isLivePath('/@kleicastilloo/live'), true);
  assert.equal(isLivePath('/@kleicastilloo/live/'), true);
  assert.equal(isLivePath('/video/123'), false);
  assert.equal(isLivePath('/lifestyle'), false);
});
