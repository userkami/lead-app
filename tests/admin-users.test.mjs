import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserHandlers } from '../lib/admin-users.mjs';

const self = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const good = { full_name: 'New Manager', email: 'manager@example.com', role: 'manager', password: 'strong-password-123' };
function fixture(overrides = {}) {
  const calls = [];
  const profiles = [{ id: self, full_name: 'Admin', role: 'admin' }, { id: other, full_name: 'Manager', role: 'manager' }];
  const client = (url, key) => {
    calls.push(['client', key]);
    const privileged = key === 'server-test-key';
    return {
      auth: {
        getUser: async () => overrides.invalidToken ? { data: {}, error: { message: 'Invalid JWT' } } : { data: { user: { id: self } } },
        admin: {
          getUserById: async (id) => ({ data: { user: { id, email: `${id}@example.com`, password: 'must-not-leak' } } }),
          createUser: async (input) => { calls.push(['createUser', input]); return { data: { user: { id: other } } }; },
          updateUserById: async (id, input) => { calls.push(['updateUser', id, input]); return overrides.authUpdateError ? { error: { message: 'Email already exists' } } : { data: {} }; },
          deleteUser: async (id) => { calls.push(['deleteUser', id]); return { data: {} }; },
        },
      },
      from: (table) => {
        const query = {
          operation: 'select', id: null,
          select() { return this; },
          eq(_column, id) { this.id = id; return this; },
          order() { return this; },
          insert(input) { this.operation = 'insert'; calls.push(['insert', table, input]); return this; },
          update(input) { this.operation = 'update'; calls.push(['update', table, input]); return this; },
          maybeSingle() {
            return Promise.resolve({ data: privileged ? profiles.find((p) => p.id === this.id) || null : { role: overrides.role || 'admin' } });
          },
          then(resolve, reject) {
            const result = this.operation === 'insert' && overrides.insertError
              ? { error: { message: 'Profile insert failed' } }
              : { data: this.operation === 'select' ? profiles : null };
            return Promise.resolve(result).then(resolve, reject);
          },
        };
        return query;
      },
    };
  };
  const api = createUserHandlers(client, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key',
    ...(overrides.noSecret ? {} : { SUPABASE_SECRET_KEY: 'server-test-key' }),
  });
  const request = (method, body, signedIn = true) => new Request('http://localhost/api/users', {
    method, headers: signedIn ? { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { calls, api, request };
}

test('every user endpoint rejects unauthenticated callers without constructing a privileged client', async () => {
  const f = fixture();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.equal((await f.api[method](f.request(method, undefined, false))).status, 401);
  }
  assert.equal(f.calls.length, 0);
});
test('manager cannot list or mutate users, even by calling the API directly', async () => {
  const f = fixture({ role: 'manager' });
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.equal((await f.api[method](f.request(method, method === 'GET' ? undefined : good))).status, 403);
  }
  assert.ok(f.calls.every((call) => call[0] === 'client' && call[1] === 'public-test-key'));
});
test('invalid tokens are rejected before looking up permissions', async () => {
  const f = fixture({ invalidToken: true });
  assert.equal((await f.api.GET(f.request('GET'))).status, 401);
  assert.equal(f.calls.length, 1);
});
test('missing server configuration produces a useful error without privileged operations', async () => {
  const f = fixture({ noSecret: true });
  const result = await f.api.GET(f.request('GET'));
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /SUPABASE_SECRET_KEY/);
});
test('creation validates roles, email, name, and password before creating an Auth account', async () => {
  for (const changes of [{ role: 'owner' }, { email: 'broken' }, { full_name: '' }, { password: 'short' }]) {
    const f = fixture();
    assert.equal((await f.api.POST(f.request('POST', { ...good, ...changes }))).status, 400);
    assert.ok(!f.calls.some((call) => call[0] === 'createUser'));
  }
});
test('creating a user creates both a confirmed login and a staff profile', async () => {
  const f = fixture();
  assert.equal((await f.api.POST(f.request('POST', good))).status, 200);
  assert.ok(f.calls.some((call) => call[0] === 'createUser' && call[1].email_confirm === true));
  assert.ok(f.calls.some((call) => call[0] === 'insert' && call[2].id === other && call[2].role === 'manager'));
});
test('failed profile creation removes the newly created Auth account', async () => {
  const f = fixture({ insertError: true });
  assert.equal((await f.api.POST(f.request('POST', good))).status, 400);
  assert.ok(f.calls.some((call) => call[0] === 'deleteUser' && call[1] === other));
});
test('admins cannot delete themselves or demote themselves', async () => {
  const f = fixture();
  assert.equal((await f.api.DELETE(f.request('DELETE', { id: self }))).status, 400);
  assert.equal((await f.api.PATCH(f.request('PATCH', { ...good, id: self }))).status, 400);
  assert.ok(!f.calls.some((call) => ['updateUser', 'deleteUser', 'update'].includes(call[0])));
});
test('editing without a password preserves the current password', async () => {
  const f = fixture();
  assert.equal((await f.api.PATCH(f.request('PATCH', { ...good, id: other, password: '' }))).status, 200);
  const mutation = f.calls.find((call) => call[0] === 'updateUser');
  assert.deepEqual(mutation[2], { email: good.email });
});
test('failed Auth edits restore the previous profile details', async () => {
  const f = fixture({ authUpdateError: true });
  assert.equal((await f.api.PATCH(f.request('PATCH', { ...good, id: other, full_name: 'Changed', role: 'admin' }))).status, 400);
  const changes = f.calls.filter((call) => call[0] === 'update');
  assert.deepEqual(changes.at(-1)[2], { full_name: 'Manager', role: 'manager' });
});
test('delete targets only existing staff accounts', async () => {
  const f = fixture();
  assert.equal((await f.api.DELETE(f.request('DELETE', { id: '33333333-3333-4333-8333-333333333333' }))).status, 404);
  assert.ok(!f.calls.some((call) => call[0] === 'deleteUser'));
  assert.equal((await f.api.DELETE(f.request('DELETE', { id: other }))).status, 200);
  assert.ok(f.calls.some((call) => call[0] === 'deleteUser' && call[1] === other));
});
test('user listing returns only required fields and disables caching', async () => {
  const f = fixture();
  const result = await f.api.GET(f.request('GET'));
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const body = await result.json();
  assert.equal(body.users[0].is_self, true);
  assert.equal(body.users[1].is_self, false);
  assert.ok(!JSON.stringify(body).includes('must-not-leak'));
  assert.ok(!JSON.stringify(body).includes('server-test-key'));
});
