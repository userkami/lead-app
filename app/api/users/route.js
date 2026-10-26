import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createUserHandlers } from '../../../lib/admin-users.mjs';

export const dynamic = 'force-dynamic';
const handlers = createUserHandlers(createClient, process.env);
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
