import test from 'node:test';
import assert from 'node:assert/strict';
import { executiveFields, saveExecutive, setExecutiveActive, deleteExecutive } from '../lib/executives.mjs';

const id = '44444444-4444-4444-8444-444444444444';
const valid = { name: ' Sales executive ', whatsapp_number: '0300 1234567', whatsapp_group_link: '', destination_type: 'individual', active: true };
function client(result) {
  const writes = [];
  const query = {
    from(table) { assert.equal(table, 'sales_executives'); return this; },
    insert(values) { writes.push(['insert', values]); return this; },
    update(values) { writes.push(['update', values]); return this; },
    delete() { writes.push(['delete']); return this; },
    eq(column, value) { assert.equal(column, 'id'); assert.equal(value, id); return this; },
    select() { return Promise.resolve(result); },
  };
  return { query, writes };
}

test('executive phone numbers normalize local and international formats for WhatsApp', () => {
  for (const phone of ['0300 1234567', '3001234567', '+92 300-1234567', '00923001234567']) {
    assert.deepEqual(executiveFields({ ...valid, whatsapp_number: phone }), { name: 'Sales executive', whatsapp_number: '923001234567', whatsapp_group_link: null, destination_type: 'individual', active: true });
  }
  assert.equal(executiveFields({ ...valid, whatsapp_number: '+44 7700 900123' }).whatsapp_number, '447700900123');
});
test('WhatsApp groups store a validated invite link instead of a phone number', () => {
  assert.deepEqual(executiveFields({ ...valid, name: ' Team Alpha ', destination_type: 'group', whatsapp_group_link: ' https://chat.whatsapp.com/AbCdEf123_- ' }), {
    name: 'Team Alpha', whatsapp_number: null, whatsapp_group_link: 'https://chat.whatsapp.com/AbCdEf123_-', destination_type: 'group', active: true,
  });
  const tracked = 'https://chat.whatsapp.com/JdaxDirJ55UCrV7Bq0ELPg?s=sw&p=i&mlu=4&ilr=4&iam=2';
  assert.equal(executiveFields({ ...valid, destination_type: 'group', whatsapp_group_link: tracked }).whatsapp_group_link, tracked);
  for (const whatsapp_group_link of ['', 'https://wa.me/923001234567', 'http://chat.whatsapp.com/Invite', 'https://example.com/group']) {
    assert.throws(() => executiveFields({ ...valid, destination_type: 'group', whatsapp_group_link }), /valid WhatsApp group invite link/);
  }
});
test('invalid executive details are rejected before writing to Supabase', async () => {
  for (const patch of [{ name: ' ' }, { name: 'x'.repeat(201) }, { whatsapp_number: 'abc03001234567' }, { whatsapp_number: '123' }, { whatsapp_number: '+1234567890123456' }, { destination_type: 'broadcast' }, { active: 'true' }]) {
    const f = client({ data: [{ id }] });
    await assert.rejects(saveExecutive(f.query, { ...valid, ...patch }));
    assert.equal(f.writes.length, 0);
  }
});
test('RLS-denied or stale updates and deletions do not report success', async () => {
  const f = client({ data: [] });
  await assert.rejects(saveExecutive(f.query, valid, id), /permission denied/);
  await assert.rejects(setExecutiveActive(f.query, id, false), /permission denied/);
  await assert.rejects(deleteExecutive(f.query, id), /permission denied/);
});
test('foreign key deletion errors explain how to preserve assigned leads', async () => {
  const f = client({ error: { code: '23503', message: 'foreign key violation' } });
  await assert.rejects(deleteExecutive(f.query, id), /Reassign or unassign.*deactivate/);
});
test('deactivating an executive updates only active status', async () => {
  const f = client({ data: [{ id, ...valid, active: false }] });
  await setExecutiveActive(f.query, id, false);
  assert.deepEqual(f.writes, [['update', { active: false }]]);
});
