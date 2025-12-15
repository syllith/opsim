// tests/promptManager.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine/index.js';
import promptManager from '../src/engine/core/promptManager.js';

test('requestChoice emits prompt and resolves when submitChoice is called', async () => {
  const gs = { players: { alice: {}, bob: {} } };
  let seenPrompt = null;
  const onPrompt = ({ prompt }) => { seenPrompt = prompt; };
  engine.on('prompt', onPrompt);

  const choiceSpec = { type: 'select', min: 1, max: 1, message: 'Pick one' };
  const { promptId, promise } = promptManager.requestChoice(gs, 'alice', choiceSpec, { timeoutMs: 5000 });

  // wait briefly for event to be emitted
  await new Promise((r) => setImmediate(r));
  assert.ok(seenPrompt, 'prompt event should be emitted');
  assert.strictEqual(seenPrompt.id, promptId, 'emitted prompt id matches');

  // Submit with wrong player should be rejected
  const wrong = promptManager.submitChoice(promptId, 'bob', ['choice1']);
  assert.strictEqual(wrong.success, false, 'wrong player should not be allowed to submit');

  // Submit with correct player
  const ok = promptManager.submitChoice(promptId, 'alice', ['choiceA']);
  assert.strictEqual(ok.success, true, 'correct player should be allowed to submit');

  const result = await promise;
  assert.deepStrictEqual(result.selection, ['choiceA'], 'selection should match submitted value');

  engine.off('prompt', onPrompt);
});

test('requestChoice times out when no submission', async () => {
  const gs = {};
  const { promise } = promptManager.requestChoice(gs, 'bob', { type: 'confirm' }, { timeoutMs: 10 });
  let caught = null;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof Error, 'promise should reject on timeout');
  assert.match(String(caught), /timed out/i);
});
