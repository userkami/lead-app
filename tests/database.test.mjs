import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const admin = '11111111-1111-4111-8111-111111111111';
const manager = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const executive = '44444444-4444-4444-8444-444444444444';
const replacement = '55555555-5555-4555-8555-555555555555';
const inactive = '66666666-6666-4666-8666-666666666666';

test('database migration and assignment permissions in isolated PostgreSQL', async (t) => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated, anon;
    create table public.meta_leads (
      id text primary key,
      created_time timestamptz,
      lead_status text default 'CREATED'
    );
    create publication supabase_realtime;
    insert into auth.users values ('${admin}'), ('${manager}'), ('${outsider}');
    insert into public.meta_leads (id, lead_status) values ('existing', 'CLOSED');
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into public.profiles (id, full_name, role)
      values ('${admin}', 'Admin', 'admin'), ('${manager}', 'Manager', 'manager');
    insert into public.sales_executives (id, name, whatsapp_number, active) values
      ('${executive}', 'Executive One', '923001234567', true),
      ('${replacement}', 'Executive Two', '923001234568', true),
      ('${inactive}', 'Inactive', '923001234569', false);
    update public.meta_leads set notes = 'Keep these notes', assigned_to = '${executive}',
      assigned_by = '${manager}', assigned_at = '2026-10-26T01:00:00Z' where id = 'existing';
    grant select on public.profiles, public.meta_leads, public.sales_executives to authenticated;
    grant insert, update, delete on public.sales_executives to authenticated, anon;
    grant select on public.sales_executives to anon;
  `);
  const migration = await readFile(new URL('../supabase/user-management.sql', import.meta.url), 'utf8');
  const groupMigration = await readFile(new URL('../supabase/whatsapp-groups.sql', import.meta.url), 'utf8');
  const before = (await db.query("select * from public.meta_leads where id = 'existing'")).rows[0];
  await db.exec(migration);
  await db.exec(groupMigration);

  async function actor(id, action, role = 'authenticated') {
    await db.exec(`set role ${role};`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
    try { return await action(); }
    finally { await db.exec('reset role;'); }
  }
  async function lead(id) { return (await db.query('select * from public.meta_leads where id = $1', [id])).rows[0]; }
  async function change(id, next, expected, at) {
    return db.query('select public.change_lead_assignment($1, $2, $3, $4)', [id, next, expected, at]);
  }

  await t.test('migration preserves existing values and can be rerun', async () => {
    assert.deepEqual(await lead('existing'), before);
    await db.exec(migration);
    await db.exec(groupMigration);
    assert.deepEqual(await lead('existing'), before);
  });
  await t.test('manager can assign, reassign, and unassign while preserving notes', async () => {
    await db.query("insert into public.meta_leads (id, notes) values ('workflow', 'Follow up tomorrow')");
    await actor(manager, () => change('workflow', executive, null, null));
    let row = await lead('workflow');
    assert.equal(row.assigned_to, executive);
    assert.equal(row.assigned_by, manager);
    assert.equal(row.lead_status, 'ASSIGNED');
    await actor(manager, () => change('workflow', replacement, row.assigned_to, row.assigned_at));
    row = await lead('workflow');
    assert.equal(row.assigned_to, replacement);
    await actor(manager, () => change('workflow', null, row.assigned_to, row.assigned_at));
    row = await lead('workflow');
    assert.equal(row.assigned_to, null);
    assert.equal(row.assigned_at, null);
    assert.equal(row.assigned_by, null);
    assert.equal(row.lead_status, 'CREATED');
    assert.equal(row.notes, 'Follow up tomorrow');
  });
  await t.test('stale owner or timestamp cannot overwrite a newer assignment', async () => {
    const row = await lead('existing');
    await assert.rejects(actor(manager, () => change('existing', replacement, null, null)), /Assignment changed/);
    await assert.rejects(actor(manager, () => change('existing', replacement, executive, null)), /Assignment changed/);
    assert.deepEqual(await lead('existing'), row);
  });
  await t.test('inactive executive is rejected and existing assignment is preserved', async () => {
    const row = await lead('existing');
    await assert.rejects(actor(admin, () => change('existing', inactive, row.assigned_to, row.assigned_at)), /active sales executive/);
    assert.deepEqual(await lead('existing'), row);
  });
  await t.test('authenticated non-staff and anonymous callers cannot reassign', async () => {
    const row = await lead('existing');
    await assert.rejects(actor(outsider, () => change('existing', replacement, row.assigned_to, row.assigned_at)), /not allowed/);
    await assert.rejects(actor(null, () => change('existing', replacement, row.assigned_to, row.assigned_at), 'anon'), /permission denied/);
    assert.deepEqual(await lead('existing'), row);
  });
  await t.test('a missing lead is reported rather than silently accepted', async () => {
    await assert.rejects(actor(manager, () => change('missing', replacement, null, null)), /Lead not found/);
  });
  await t.test('last admin cannot be demoted or deleted, including through Auth cascade', async () => {
    await assert.rejects(db.query("update public.profiles set role = 'manager' where id = $1", [admin]), /last admin cannot be demoted/);
    await assert.rejects(db.query('delete from public.profiles where id = $1', [admin]), /last admin cannot be deleted/);
    await assert.rejects(db.query('delete from auth.users where id = $1', [admin]), /last admin cannot be deleted/);
    assert.equal((await db.query('select role from public.profiles where id = $1', [admin])).rows[0].role, 'admin');
  });
  await t.test('admin can create, edit, deactivate, reactivate, and delete an unassigned executive', async () => {
    const created = await actor(admin, () => db.query("insert into public.sales_executives (name, whatsapp_number) values ('New executive', '923001234560') returning id", []));
    const id = created.rows[0].id;
    const updated = await actor(admin, () => db.query("update public.sales_executives set name = 'Updated executive', whatsapp_number = '923001234561', active = false where id = $1 returning *", [id]));
    assert.equal(updated.rows[0].name, 'Updated executive');
    assert.equal(updated.rows[0].whatsapp_number, '923001234561');
    assert.equal(updated.rows[0].active, false);
    await actor(admin, () => db.query('update public.sales_executives set active = true where id = $1', [id]));
    assert.equal((await db.query('select active from public.sales_executives where id = $1', [id])).rows[0].active, true);
    const deleted = await actor(admin, () => db.query('delete from public.sales_executives where id = $1 returning id', [id]));
    assert.equal(deleted.rows[0].id, id);
  });
  await t.test('admin can create a WhatsApp group and staff can assign a lead to it', async () => {
    const created = await actor(admin, () => db.query("insert into public.sales_executives (name, destination_type, whatsapp_number, whatsapp_group_link) values ('Team Alpha', 'group', null, 'https://chat.whatsapp.com/AbCdEf123_-?s=sw&p=i&mlu=4') returning *"));
    const group = created.rows[0];
    assert.equal(group.destination_type, 'group');
    assert.equal(group.whatsapp_number, null);
    await db.query("insert into public.meta_leads (id, notes) values ('group-workflow', 'Group follow-up')");
    await actor(manager, () => change('group-workflow', group.id, null, null));
    const row = await lead('group-workflow');
    assert.equal(row.assigned_to, group.id);
    assert.equal(row.lead_status, 'ASSIGNED');
    assert.equal(row.notes, 'Group follow-up');
  });
  await t.test('database rejects invalid group destinations', async () => {
    await assert.rejects(actor(admin, () => db.query("insert into public.sales_executives (name, destination_type, whatsapp_number, whatsapp_group_link) values ('Bad group', 'group', null, 'https://example.com/not-whatsapp')")), /sales_executives_destination_check/);
    await assert.rejects(actor(admin, () => db.query("insert into public.sales_executives (name, destination_type, whatsapp_number) values ('Missing link', 'group', null)")), /sales_executives_destination_check/);
  });
  await t.test('manager and anonymous requests cannot create, update, or delete executives', async () => {
    for (const [id, role] of [[manager, 'authenticated'], [null, 'anon']]) {
      await assert.rejects(actor(id, () => db.query("insert into public.sales_executives (name, whatsapp_number) values ('Not allowed', '923001234560')"), role), /row-level security/);
      assert.equal((await actor(id, () => db.query("update public.sales_executives set name = 'Not allowed' where id = $1 returning id", [executive]), role)).rows.length, 0);
      assert.equal((await actor(id, () => db.query('delete from public.sales_executives where id = $1 returning id', [executive]), role)).rows.length, 0);
    }
    assert.equal((await db.query('select name from public.sales_executives where id = $1', [executive])).rows[0].name, 'Executive One');
  });
  await t.test('assigned executive cannot be deleted; deactivation keeps leads and notes intact', async () => {
    const row = await lead('existing');
    await assert.rejects(actor(admin, () => db.query('delete from public.sales_executives where id = $1', [executive])), (e) => e.code === '23503');
    await actor(admin, () => db.query('update public.sales_executives set active = false where id = $1', [executive]));
    assert.deepEqual(await lead('existing'), row);
    await assert.rejects(actor(manager, () => change('workflow', executive, null, null)), /active sales executive/);
    await actor(admin, () => db.query('update public.sales_executives set active = true where id = $1', [executive]));
  });
  await t.test('deleting a manager login preserves leads, executive ownership, and notes', async () => {
    const row = await lead('existing');
    await db.query('delete from auth.users where id = $1', [manager]);
    assert.deepEqual(await lead('existing'), { ...row, assigned_by: null });
    assert.equal((await db.query('select * from public.profiles where id = $1', [manager])).rows.length, 0);
    await assert.rejects(actor(manager, () => change('existing', null, row.assigned_to, row.assigned_at)), /not allowed/);
  });
});
