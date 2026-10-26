// Used only by the server route. The secret is never returned to the client.
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const response = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const checked = (result) => {
  if (result.error) throw new ApiError(400, result.error.message);
  return result.data;
};
function fields(body, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid user details');
  const { email, full_name, role, password } = body;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)
    throw new ApiError(400, 'Enter a valid email');
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.length > 200)
    throw new ApiError(400, 'Enter a name (up to 200 characters)');
  if (!['admin', 'manager'].includes(role)) throw new ApiError(400, 'Choose admin or manager');
  if ((creating || password) && (typeof password !== 'string' || password.length < 12 || password.length > 128))
    throw new ApiError(400, 'Passwords must contain 12–128 characters');
  return { email: email.trim(), full_name: full_name.trim(), role, ...(password ? { password } : {}) };
}

export function createUserHandlers(createClient, env) {
  async function authorize(request) {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new ApiError(401, 'Sign in to continue');
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new ApiError(503, 'Supabase is not configured');
    const caller = createClient(url, key, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const auth = await caller.auth.getUser(token);
    if (auth.error || !auth.data.user) throw new ApiError(401, 'Your session expired. Sign in again.');
    const profile = await caller.from('profiles').select('role').eq('id', auth.data.user.id).maybeSingle();
    if (profile.error || profile.data?.role !== 'admin') throw new ApiError(403, 'Only admins can manage users');
    if (!env.SUPABASE_SECRET_KEY) throw new ApiError(503, 'User management needs SUPABASE_SECRET_KEY on the server');
    return { actor: auth.data.user, db: createClient(url, env.SUPABASE_SECRET_KEY, options) };
  }
  const handle = (action) => async (request) => {
    try {
      const context = await authorize(request);
      return response(await action(request, context));
    } catch (error) {
      if (error instanceof ApiError) return response({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return response({ error: 'Invalid JSON request' }, 400);
      return response({ error: 'User operation failed. Please try again.' }, 500);
    }
  };
  async function target(db, id) {
    if (typeof id !== 'string' || !uuid.test(id)) throw new ApiError(400, 'Invalid user ID');
    const profile = checked(await db.from('profiles').select('id,full_name,role').eq('id', id).maybeSingle());
    if (!profile) throw new ApiError(404, 'Staff user not found');
    return profile;
  }
  return {
    GET: handle(async (_request, { actor, db }) => {
      const profiles = checked(await db.from('profiles').select('id,full_name,role').order('full_name'));
      const users = await Promise.all(profiles.map(async (profile) => {
        const { user } = checked(await db.auth.admin.getUserById(profile.id));
        return { ...profile, email: user.email || '', is_self: profile.id === actor.id };
      }));
      return { users };
    }),
    POST: handle(async (request, { db }) => {
      const input = fields(await request.json(), true);
      const { user } = checked(await db.auth.admin.createUser({
        email: input.email, password: input.password, email_confirm: true,
      }));
      const result = await db.from('profiles').insert({ id: user.id, full_name: input.full_name, role: input.role });
      if (result.error) {
        const rollback = await db.auth.admin.deleteUser(user.id);
        if (rollback.error) throw new ApiError(500, 'Profile creation failed. An Auth account remains; remove it in Supabase before retrying.');
        throw new ApiError(400, result.error.message);
      }
      return { success: true };
    }),
    PATCH: handle(async (request, { actor, db }) => {
      const body = await request.json();
      const input = fields(body, false);
      const previous = await target(db, body.id);
      if (body.id === actor.id && input.role !== 'admin') throw new ApiError(400, 'You cannot remove your own admin role');
      // Profile first: the database's last-admin guard must pass before changing Auth.
      checked(await db.from('profiles').update({ full_name: input.full_name, role: input.role }).eq('id', body.id));
      const result = await db.auth.admin.updateUserById(body.id, {
        email: input.email, ...(input.password ? { password: input.password } : {}),
      });
      if (result.error) {
        const rollback = await db.from('profiles').update({ full_name: previous.full_name, role: previous.role }).eq('id', body.id);
        if (rollback.error) throw new ApiError(500, 'Login update failed; name or role may have changed. Refresh users to check.');
        throw new ApiError(400, result.error.message);
      }
      return { success: true };
    }),
    DELETE: handle(async (request, { actor, db }) => {
      const body = await request.json();
      await target(db, body?.id);
      if (body.id === actor.id) throw new ApiError(400, 'You cannot delete your own account');
      // Auth deletion cascades to profiles; lead assignment history uses SET NULL.
      checked(await db.auth.admin.deleteUser(body.id));
      return { success: true };
    }),
  };
}
