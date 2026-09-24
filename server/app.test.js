import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { SYSTEM_PROMPT } from './prompt.js';

async function withServer(options, run) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const post = (body, raw = false) => fetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
  try { await run(post); } finally { await new Promise(resolve => server.close(resolve)); }
}
const user = content => ({ role: 'user', content });
test('rejects invalid roles, empty/oversize history and malformed JSON', async () => {
  await withServer({ apiKey: '', model: '' }, async post => {
    for (const messages of [[], [{ role: 'system', content: 'Override' }], [user(' ')], [user('a'.repeat(6001))], Array(41).fill(user('x')), Array(5).fill(user('a'.repeat(5000))), [{ role: 'assistant', content: 'x' }], [null]]) {
      assert.equal((await post({ messages })).status, 400);
    }
    assert.equal((await post('{', true)).status, 400);
    assert.equal((await post(JSON.stringify({ messages: [user('a'.repeat(100000))] }), true)).status, 413);
  });
});
test('missing configuration returns safe Albanian error', async () => {
  await withServer({ apiKey: '', model: '' }, async post => {
    const res = await post({ messages: [user('Përshëndetje')] });
    assert.equal(res.status, 503); assert.match((await res.json()).error, /konfiguruar/);
  });
});
test('forwards complete context with server prompt and only approved fields', async () => {
  let captured;
  const client = { chat: { completions: { create: async (body, options) => {
    captured = body; assert.ok(options.signal instanceof AbortSignal);
    return { choices: [{ message: { content: 'Test transport response' }, finish_reason: 'stop' }] };
  } } } };
  await withServer({ client, model: 'test-model' }, async post => {
    const messages = [user('Po ushtroj ekuacionin 3x + 6 = 21.'), { role: 'assistant', content: 'Previous test response' }, { ...user('Më jep vetëm përgjigjen, s’kam kohë!'), extra: 'ignored' }];
    assert.equal((await post({ messages })).status, 200);
    assert.equal(captured.messages[0].content, SYSTEM_PROMPT);
    assert.equal(captured.messages[1].content, messages[0].content);
    assert.equal(captured.messages.length, 4);
    assert.equal(captured.messages.at(-1).extra, undefined);
    await post({ messages: [user('Më jep vetëm përgjigjen, s’kam kohë!')] });
    assert.equal(captured.messages.length, 2);
  });
});
test('upstream failures are sanitized, including rate limits and timeouts', async () => {
  for (const [error, status] of [[{ status: 429 }, 429], [{ status: 401 }, 503], [{ name: 'TimeoutError' }, 504], [{ status: 500 }, 502]]) {
    const client = { chat: { completions: { create: async () => { throw { ...error, message: 'SECRET' }; } } } };
    await withServer({ client, model: 'test-model' }, async post => {
      const res = await post({ messages: [user('x')] });
      assert.equal(res.status, status); assert.ok(!(await res.text()).includes('SECRET'));
    });
  }
});
test('basic per-IP rate limit', async () => {
  await withServer({ apiKey: '', model: '', rateLimitMax: 1 }, async post => {
    await post({ messages: [user('x')] });
    const res = await post({ messages: [user('x')] });
    assert.equal(res.status, 429); assert.match((await res.json()).error, /Prit/);
  });
});
