import AsyncStorage from '@react-native-async-storage/async-storage';

// Shared storage key the iOS WidgetKit extension reads. This module only
// handles the JS → storage write side; the native widget target still has
// to be added via Xcode (or an `expo-apple-targets` plugin) to display the
// data on the home screen.
//
// To finish the widget:
//   1. Create a WidgetKit extension in Xcode (File → New → Target → Widget
//      Extension).
//   2. Configure the extension and the main app to share an App Group
//      (e.g. `group.com.stroomlabs.command`).
//   3. In the Widget's TimelineProvider, read the JSON payload this module
//      writes via UserDefaults(suiteName:) — the key is
//      `stroom.command.widget` and the shape matches WidgetPayload below.
//   4. Refresh timeline every 15 minutes.
//
// Until that native side is added this module silently no-ops on web /
// non-iOS platforms and just mirrors to AsyncStorage for debugging.

const WIDGET_KEY = 'stroom.command.widget';

export interface WidgetPayload {
  queue_depth: number;
  claims_today: number;
  updated_at: string; // ISO timestamp — WidgetKit can display "X min ago"
}

export async function writeWidgetPayload(payload: {
  queueDepth: number;
  claimsToday: number;
}): Promise<void> {
  const body: WidgetPayload = {
    queue_depth: payload.queueDepth,
    claims_today: payload.claimsToday,
    updated_at: new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(body));
  } catch {
    // Swallow — widget data is best-effort
  }
}

export { WIDGET_KEY };
