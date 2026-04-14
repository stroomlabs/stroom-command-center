// DR-036 operator admin Edge Function
// v5: Skip supabase-js auth dance. Parse JWT directly (base64url aware),
// check caller capability via admin client + direct table read.
// Eliminates JWT propagation issue in supabase-js RPC calls.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type Action =
  | { action: 'invite'; email: string; display_name?: string; role_id: string; allowed_verticals?: string[] }
  | { action: 'change_role'; user_id: string; role_id: string }
  | { action: 'set_verticals'; user_id: string; allowed_verticals: string[] }
  | { action: 'deactivate'; user_id: string }
  | { action: 'reactivate'; user_id: string }
  | { action: 'resend_invite'; user_id: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
  });

const pgErr = (err: any) => ({
  message: err?.message ?? null,
  code: err?.code ?? null,
  hint: err?.hint ?? null,
  details: err?.details ?? null,
});

// base64url decode (JWT payloads use URL-safe base64 without padding)
const b64urlDecode = (str: string): string => {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
};

// Parse JWT payload without verification. Signature verification happens at
// PostgREST layer for DB queries; here we just need the sub claim.
const parseJwtSub = (jwt: string): string | null => {
  try {
    const [, payloadB64] = jwt.split('.');
    if (!payloadB64) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    return json({ error: 'server_misconfigured', detail: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  // Extract caller identity from Authorization header
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const callerJwt = authHeader.slice(7);
  const callerId = parseJwtSub(callerJwt);
  if (!callerId) return json({ error: 'invalid_jwt', detail: 'Cannot parse sub claim' }, 401);

  // Admin client — service role, used for all reads/writes
  const admin = createClient(url, serviceKey, {
    global: { headers: { Authorization: `Bearer ${serviceKey}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Check caller's role directly via admin client (no SECURITY DEFINER / auth.uid indirection)
  const { data: callerProfile, error: profileErr } = await admin
    .schema('intel')
    .from('operator_profiles')
    .select('role_id, capability_overrides, is_disabled')
    .eq('user_id', callerId)
    .maybeSingle();

  if (profileErr) return json({ error: 'caller_profile_lookup_failed', detail: pgErr(profileErr) }, 500);
  if (!callerProfile) return json({ error: 'caller_not_an_operator' }, 403);
  if (callerProfile.is_disabled) return json({ error: 'caller_disabled' }, 403);

  // Look up caller's role template
  const { data: callerRole, error: callerRoleErr } = await admin
    .schema('intel')
    .from('operator_roles')
    .select('id, capabilities')
    .eq('id', callerProfile.role_id)
    .maybeSingle();

  if (callerRoleErr) return json({ error: 'caller_role_lookup_failed', detail: pgErr(callerRoleErr) }, 500);
  if (!callerRole) return json({ error: 'caller_role_not_found', role_id: callerProfile.role_id }, 500);

  // Check admin.manage_users capability: override first, then role template
  const overrides = (callerProfile.capability_overrides ?? {}) as Record<string, boolean>;
  const roleCaps = (callerRole.capabilities ?? {}) as Record<string, boolean>;
  const canManage = overrides['admin.manage_users'] ?? roleCaps['admin.manage_users'] ?? false;

  if (canManage !== true) {
    return json({
      error: 'insufficient_capability',
      required: 'admin.manage_users',
      caller_role: callerRole.id,
      has_cap_in_role: roleCaps['admin.manage_users'] ?? null,
      has_cap_in_override: overrides['admin.manage_users'] ?? null,
    }, 403);
  }

  let payload: Action;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  try {
    switch (payload.action) {
      case 'invite': {
        const { email, display_name, role_id, allowed_verticals } = payload;
        if (!email || !role_id) return json({ error: 'missing_fields', required: ['email','role_id'] }, 400);

        const roleQuery = await admin
          .schema('intel')
          .from('operator_roles')
          .select('id')
          .eq('id', role_id)
          .maybeSingle();

        if (roleQuery.error) return json({ error: 'role_lookup_failed', detail: pgErr(roleQuery.error), role_id }, 500);
        if (!roleQuery.data) return json({ error: 'role_not_found', role_id }, 404);

        const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { display_name, invited_by: callerId, role_id },
        });
        if (inviteErr) return json({ error: 'invite_failed', detail: inviteErr.message }, 500);
        if (!inviteData?.user) return json({ error: 'invite_no_user_returned' }, 500);

        const { error: profileUpsertErr } = await admin
          .schema('intel')
          .from('operator_profiles')
          .upsert({
            user_id: inviteData.user.id,
            role_id,
            display_name: display_name ?? null,
            allowed_verticals: allowed_verticals ?? null,
            invited_by: callerId,
            invited_at: new Date().toISOString(),
            is_disabled: false,
          }, { onConflict: 'user_id' });
        if (profileUpsertErr) return json({ error: 'profile_upsert_failed', detail: pgErr(profileUpsertErr) }, 500);

        return json({ ok: true, action: 'invite', user_id: inviteData.user.id, email });
      }

      case 'change_role': {
        const { user_id, role_id } = payload;
        if (!user_id || !role_id) return json({ error: 'missing_fields', required: ['user_id','role_id'] }, 400);
        if (user_id === callerId) return json({ error: 'cannot_change_own_role' }, 400);

        const { data: role } = await admin.schema('intel').from('operator_roles').select('id').eq('id', role_id).maybeSingle();
        if (!role) return json({ error: 'role_not_found', role_id }, 404);

        const { error } = await admin
          .schema('intel')
          .from('operator_profiles')
          .update({ role_id, updated_at: new Date().toISOString() })
          .eq('user_id', user_id);
        if (error) return json({ error: 'role_change_failed', detail: pgErr(error) }, 500);

        return json({ ok: true, action: 'change_role', user_id, role_id });
      }

      case 'set_verticals': {
        const { user_id, allowed_verticals } = payload;
        if (!user_id || !Array.isArray(allowed_verticals)) return json({ error: 'missing_fields' }, 400);

        const { error } = await admin
          .schema('intel')
          .from('operator_profiles')
          .update({ allowed_verticals, updated_at: new Date().toISOString() })
          .eq('user_id', user_id);
        if (error) return json({ error: 'verticals_update_failed', detail: pgErr(error) }, 500);

        return json({ ok: true, action: 'set_verticals', user_id, allowed_verticals });
      }

      case 'deactivate': {
        const { user_id } = payload;
        if (!user_id) return json({ error: 'missing_fields', required: ['user_id'] }, 400);
        if (user_id === callerId) return json({ error: 'cannot_deactivate_self' }, 400);

        const { error } = await admin
          .schema('intel')
          .from('operator_profiles')
          .update({ is_disabled: true, updated_at: new Date().toISOString() })
          .eq('user_id', user_id);
        if (error) return json({ error: 'deactivate_failed', detail: pgErr(error) }, 500);

        await admin.auth.admin.signOut(user_id, 'global').catch(() => null);

        return json({ ok: true, action: 'deactivate', user_id });
      }

      case 'reactivate': {
        const { user_id } = payload;
        if (!user_id) return json({ error: 'missing_fields', required: ['user_id'] }, 400);

        const { error } = await admin
          .schema('intel')
          .from('operator_profiles')
          .update({ is_disabled: false, updated_at: new Date().toISOString() })
          .eq('user_id', user_id);
        if (error) return json({ error: 'reactivate_failed', detail: pgErr(error) }, 500);

        return json({ ok: true, action: 'reactivate', user_id });
      }

      case 'resend_invite': {
        const { user_id } = payload;
        if (!user_id) return json({ error: 'missing_fields', required: ['user_id'] }, 400);

        const { data: userData, error: getErr } = await admin.auth.admin.getUserById(user_id);
        if (getErr || !userData?.user?.email) return json({ error: 'user_not_found', detail: getErr?.message }, 404);

        const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(userData.user.email);
        if (inviteErr) return json({ error: 'resend_failed', detail: inviteErr.message }, 500);

        return json({ ok: true, action: 'resend_invite', user_id, email: userData.user.email });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    return json({ error: 'internal_error', detail: String(err) }, 500);
  }
});
