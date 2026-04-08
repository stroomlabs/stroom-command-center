// Siri Shortcuts / App Intents — TypeScript scaffold.
//
// The Swift-side App Intent (defined in native-scaffolds/README.md) calls
// into JS via a future native module bridge. Until that native bridge ships
// (pending Apple Developer entitlement + Xcode Widget/Extension target),
// these handlers are importable from JS land so we can OTA the business
// logic the moment the native binding lands.
//
// To activate: see /native-scaffolds/README.md for Apple Developer Portal
// + Xcode steps.

import supabase from './supabase';
import { runAutoGovernance } from '@stroom/supabase';

export type StroomIntent = 'runSweep' | 'checkQueue';

export interface IntentResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// Run Stroom Sweep — calls the governance-sweep Edge Function with the
// operator's auth token (supabase client carries the session). Returns a
// short status string suitable for Siri to read aloud.
export async function runSweepIntent(): Promise<IntentResult> {
  try {
    const result = await runAutoGovernance(supabase);
    const total = result.approved + result.flagged + result.rejected;
    if (total === 0) {
      return {
        ok: true,
        message: 'No claims needed governance. The queue is clean.',
        data: result as unknown as Record<string, unknown>,
      };
    }
    return {
      ok: true,
      message: `Sweep complete. Approved ${result.approved}, flagged ${result.flagged}, rejected ${result.rejected}.`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (e: any) {
    return {
      ok: false,
      message: `Sweep failed: ${e?.message ?? 'unknown error'}`,
    };
  }
}

// Check Queue — quick read of current queue depth via the pulse RPC.
// Same Siri-readable shape as runSweepIntent.
export async function checkQueueIntent(): Promise<IntentResult> {
  try {
    const { data, error } = await supabase
      .schema('intel')
      .rpc('get_command_pulse');
    if (error) throw error;
    const depth = (data as any)?.queue_depth ?? 0;
    return {
      ok: true,
      message:
        depth === 0
          ? 'Queue is empty.'
          : `${depth} claim${depth === 1 ? '' : 's'} waiting for review.`,
      data: { queue_depth: depth },
    };
  } catch (e: any) {
    return {
      ok: false,
      message: `Queue check failed: ${e?.message ?? 'unknown error'}`,
    };
  }
}

// Dispatcher used by the future native bridge — given an intent identifier
// (matching NSUserActivityType in Info.plist), invoke the right handler.
export async function dispatchIntent(
  identifier: string
): Promise<IntentResult> {
  switch (identifier) {
    case 'com.stroomlabs.commandcenter.runsweep':
      return runSweepIntent();
    case 'com.stroomlabs.commandcenter.checkqueue':
      return checkQueueIntent();
    default:
      return { ok: false, message: `Unknown intent: ${identifier}` };
  }
}
