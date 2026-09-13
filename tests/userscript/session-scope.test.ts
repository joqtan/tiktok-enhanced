import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionScope } from '../../src/userscript/session-scope.ts';

test('disposes a registered resource at most once', () => {
  const scope = createSessionScope();
  let disposed = 0;
  const disposer = () => { disposed++; };

  scope.add(disposer);
  scope.add(disposer);
  scope.dispose();
  scope.dispose();

  assert.equal(disposed, 1);
  assert.equal(scope.disposed, true);
});

test('keeps session resources isolated', () => {
  const first = createSessionScope();
  const second = createSessionScope();
  const disposed: string[] = [];

  first.add(() => disposed.push('first'));
  second.add(() => disposed.push('second'));
  first.dispose();

  assert.deepEqual(disposed, ['first']);
  second.dispose();
  assert.deepEqual(disposed, ['first', 'second']);
});

test('runs late resource callbacks immediately after replacement disposal', () => {
  const oldSession = createSessionScope();
  const replacement = createSessionScope();
  let oldResourceDisposed = 0;
  let lateResourceDisposed = 0;
  let replacementResourceDisposed = 0;

  oldSession.add(() => { oldResourceDisposed++; });
  oldSession.dispose();
  oldSession.add(() => { lateResourceDisposed++; });
  replacement.add(() => { replacementResourceDisposed++; });

  assert.equal(oldResourceDisposed, 1);
  assert.equal(lateResourceDisposed, 1);
  assert.equal(replacementResourceDisposed, 0);
  replacement.dispose();
  assert.equal(replacementResourceDisposed, 1);
});
