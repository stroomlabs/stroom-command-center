import { SUPABASE_URL } from '@stroom/supabase';
import supabase from './supabase';
import { clearCapabilityCache } from '../hooks/useCapabilities';

// Thin wrapper around the intel.operator-admin Edge Function. Every
// write action in the DR-036 tiered rights system (invite, change_role,
// set_verticals, deactivate, reactivate, resend_invite) goes through
// this function so the server can enforce admin.manage_users and keep
// the audit trail honest.
//
// After a successful call we clear the local capability cache — that
// way, if the caller mutated their own record (or a collaborator's
// whose permissions are surfaced anywhere), the next read gets fresh
// data instead of the stale local snapshot.

export type OperatorAdminAction =
  | { action: 'invite'; email: string; display_name?: string | null; role_id: string; allowed_verticals?: string[] | null }
  | { action: 'change_role'; user_id: string; role_id: string }
  | { action: 'set_verticals'; user_id: string; allowed_verticals: string[] }
  | { action: 'deactivate'; user_id: string }
  | { action: 'reactivate'; user_id: string }
  | { action: 'resend_invite'; user_id: string };

export interface OperatorAdminResponse {
  ok: true;
  [key: string]: unknown;
}

// Friendlier copy for the common server-side error codes so the UI
// doesn't spill raw snake_case at the operator. Unknown codes fall
// through to the code string itself.
export const humanizeAdminError = (code: string): string => {
  switch (code) {
    case 'not_authenticated':
      return 'You are not signed in.';
    case 'insufficient_permissions':
    case 'forbidden':
      return 'Insufficient permissions for that action.';
    case 'cannot_target_self':
      return "You can't change your own role or status.";
    case 'invalid_email':
      return 'That email address is invalid.';
    case 'email_already_exists':
    case 'already_invited':
      return 'An operator with that email already exists.';
    case 'role_not_found':
      return 'The selected role no longer exists.';
    case 'cannot_assign_owner':
      return 'Owner role cannot be assigned via invite.';
    case 'user_not_found':
      return 'That operator no longer exists.';
    case 'unknown_error':
      return 'Something went wrong. Try again.';
    default:
      return code.replace(/_/g, ' ');
  }
};

export async function operatorAdmin<T extends OperatorAdminResponse = OperatorAdminResponse>(
  action: OperatorAdminAction
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/operator-admin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action),
  });

  // Some Edge Function variants 4xx with a JSON body, others with plain
  // text — try JSON first, fall back to a generic error.
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // ignore parse failure; handled below
  }

  if (!res.ok || !json || json.ok !== true) {
    const code =
      (json && typeof json.error === 'string' && json.error) ||
      `http_${res.status}`;
    throw new Error(code);
  }

  // Mutation succeeded — any locally cached capability view could now be
  // out of date. Wiping it is cheap: the next useCapabilities mount re-
  // fetches from the RPCs.
  void clearCapabilityCache();

  return json as T;
}
