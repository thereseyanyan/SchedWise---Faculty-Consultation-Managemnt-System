import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const source = readFileSync(new URL('../frontend/src/api.ts', import.meta.url), 'utf8')
  .replace('import.meta.env.VITE_API_URL', 'undefined');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
let sequence = 0;
const account = { email: 'faculty@example.edu', password: 'Example123!', first_name: 'Test', last_name: 'Faculty', role_id: 'faculty' };

async function scenario(replies, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    const reply = replies.shift();
    assert.ok(reply, 'Unexpected request');
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  try {
    const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}#${sequence++}`);
    await run(api, calls);
    assert.equal(replies.length, 0);
  } finally { globalThis.fetch = original; }
}
const rejected = { status: 403, body: { error: 'Invalid or missing CSRF token' } };
const refreshed = { status: 200, body: { data: { user: { id: 'admin' }, csrf_token: 'fresh-token' } } };

test('faculty creation recovers a missing token and replays the identical body once', async () => {
  await scenario([rejected, refreshed, { status: 200, body: { data: { user_id: 'new-faculty' } } }], async (api, calls) => {
    assert.equal((await api.usersApi.create(account)).user_id, 'new-faculty');
    assert.equal(calls.length, 3);
    assert.ok(calls[1].url.endsWith('/auth/me.php'));
    assert.equal(calls[2].headers['X-CSRF-Token'], 'fresh-token');
    assert.equal(calls[0].body, calls[2].body);
    assert.equal(calls[2].credentials, 'include');
  });
});

test('a repeated CSRF rejection stops after one retry', async () => {
  await scenario([rejected, refreshed, rejected], async (api, calls) => {
    await assert.rejects(api.usersApi.create(account), /Invalid or missing CSRF token/);
    assert.equal(calls.length, 3);
  });
});

test('an expired session is not replayed', async () => {
  await scenario([rejected, { status: 401, body: { error: 'Authentication required' } }], async (api, calls) => {
    await assert.rejects(api.usersApi.create(account), /session has expired/);
    assert.equal(calls.length, 2);
  });
});

test('ordinary permission failures and server errors are never replayed', async () => {
  for (const status of [403, 500]) {
    await scenario([{ status, body: { error: 'Request denied' } }], async (api, calls) => {
      await assert.rejects(api.usersApi.create(account), /Request denied/);
      assert.equal(calls.length, 1);
    });
  }
});
