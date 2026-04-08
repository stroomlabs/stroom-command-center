import * as ExpoHaptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Unified haptic grammar layer.
//
// Call sites never import expo-haptics directly — they import this file and
// use the typed `haptics` object. That gives us three things:
//
//   1. A single place to toggle "reduce haptics" for accessibility
//   2. Semantic names (approve = impact.rigid, reject = impact.soft) instead
//      of numeric ImpactFeedbackStyle arguments
//   3. A consistent grammar across the app so the same action feels the
//      same everywhere (tab switch = tap.light, session end = success, etc.)
//
// When the operator flips "Reduce Haptics" in Settings, every call here
// becomes a no-op. Persisted to AsyncStorage; read once at module load and
// cached, updated via setReduceHaptics().

const REDUCE_KEY = 'stroom.reduce_haptics';

let reduceHaptics = false;
let initialized = false;

// Fire-and-forget initial load. We don't await — the first few haptics
// after cold start just fire at full strength if the toggle was off, which
// is the desired behavior. Once loaded, subsequent calls honor the setting.
void (async () => {
  try {
    const raw = await AsyncStorage.getItem(REDUCE_KEY);
    reduceHaptics = raw === 'true';
  } catch {
    reduceHaptics = false;
  } finally {
    initialized = true;
  }
})();

export async function setReduceHaptics(value: boolean): Promise<void> {
  reduceHaptics = value;
  try {
    await AsyncStorage.setItem(REDUCE_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore — the in-memory value still reflects the user's choice for
    // the rest of the session.
  }
}

export function getReduceHaptics(): boolean {
  return reduceHaptics;
}

// Internal helper: swallow rejections. expo-haptics throws on unsupported
// devices (web, some Android configs). We want haptics to be best-effort.
function safeFire(fn: () => Promise<unknown>): void {
  if (reduceHaptics) return;
  // Don't await — haptics are fire-and-forget at call sites.
  fn().catch(() => {});
}

export const haptics = {
  // Tap grammar — used for light touches and confirmations
  tap: {
    // Selection tick (default light). Used for: tab switches, segmented
    // pill selections, long-press popover opens, chip taps.
    light: () => safeFire(() => ExpoHaptics.selectionAsync()),
    // Medium impact. Used for: confirming an action, merge dismiss,
    // opening an important sheet.
    medium: () =>
      safeFire(() =>
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium)
      ),
    // Heavy impact. Used for: destructive confirmations, hard stops.
    heavy: () =>
      safeFire(() =>
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy)
      ),
  },
  // Impact grammar — used for the two primary queue actions
  impact: {
    // Crisp, snappy thud. Used for: claim approve (commit, not swipe).
    rigid: () =>
      safeFire(() =>
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Rigid)
      ),
    // Cushioned thud. Used for: claim reject (commit, not swipe).
    soft: () =>
      safeFire(() =>
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft)
      ),
  },
  // Notification grammar — used for end-of-action feedback
  success: () =>
    safeFire(() =>
      ExpoHaptics.notificationAsync(
        ExpoHaptics.NotificationFeedbackType.Success
      )
    ),
  warning: () =>
    safeFire(() =>
      ExpoHaptics.notificationAsync(
        ExpoHaptics.NotificationFeedbackType.Warning
      )
    ),
  error: () =>
    safeFire(() =>
      ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error)
    ),
  // Introspection — for tests / debug screens
  _isInitialized: () => initialized,
} as const;
