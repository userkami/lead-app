# Lead Manager
1. For the existing `meta_leads` table, remove `lead_status` from n8n's Edit Fields payload first; its database default must remain `CREATED`. Keep the n8n secret credential in n8n only. Take a database backup, then run the entire `supabase/schema.sql` file once in the Supabase SQL editor. The script adds app fields and enables staff access rules without updating existing lead rows. It is transactional; a failed statement rolls back the setup. Do not rerun after a successful setup.
2. Create users in Auth > Users, then insert each into `profiles` with role admin/manager (see end of schema.sql).
3. Add executives to `sales_executives` (Table Editor).
4. `cp .env.example .env.local`, fill in URL + anon key, then `npm i && npm run dev`.
5. Deploy: push to GitHub, import in Vercel, set the two public env vars and the server-only secret described below.

## GitHub

`.env.local` and other environment files are ignored by Git. Only `.env.example`, containing placeholder values, belongs in the repository. Dependencies (`node_modules`), build output (`.next`, `out`), and Vercel's local configuration are also ignored. Commit `package-lock.json` for reproducible dependency installation using `npm ci`.

Create an empty GitHub repository, then connect and push this local repository:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Keep credentials in `.env.local` for local development and in your hosting provider's environment settings for deployment. The pinned framework currently has known dependency advisories; update and validate dependencies before public deployment.

## User management and reassignment

For an already configured database, run the entire `supabase/user-management.sql` in Supabase SQL Editor (do not rerun the initial schema). Then add `SUPABASE_SECRET_KEY` to `.env.local` and to your hosting server's environment, and restart the app. This is a server-only secret; never use a `NEXT_PUBLIC_` prefix or commit `.env.local`.

Admins get a **Manage users** tab to create, edit, or permanently delete admin/manager login accounts. New accounts are confirmed and can sign in immediately with the assigned password. Editing supports name, email, role, and an optional replacement password. Admins cannot delete/demote themselves; a database trigger protects the last admin. Login accounts are separate from sales executives, who remain the lead assignment targets. Removing a login preserves leads and executive assignments, but clears references recording that deleted login as the assigning user.

Both admins and managers can reassign an assigned lead or confirm unassignment from its detail sheet. Reassignment resets status to `ASSIGNED`; unassignment resets it to `CREATED`. Saved notes are preserved. Stale assignment changes are rejected and must be retried after reopening the lead. Reassignment does not send a WhatsApp message automatically; reopen the lead to resend it to the new executive.

Verification: `npm test` checks user API access control, validation, and failure handling using mocked Supabase services, and runs the SQL migration and assignment permissions in an isolated embedded PostgreSQL database. These tests do not modify the live database. `npm run build` checks compilation. With the migration applied, verify manager access is denied at `/api/users`, create/edit/delete a disposable manager through the admin panel, and verify reassignment/unassignment plus notes preservation survive the next n8n sync.
