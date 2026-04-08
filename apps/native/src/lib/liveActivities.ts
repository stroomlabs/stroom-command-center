// Live Activities — TypeScript scaffold.
//
// iOS Live Activities require a Widget Extension target with a Swift
// `ActivityAttributes` struct. The Info.plist key `NSSupportsLiveActivities`
// is already set in app.json, but the actual activity cannot start until the
// Widget Extension target ships in a future native build.
//
// Until then, all functions here log a TODO and return null. Call sites can
// import and call these freely — once the native module + Widget Extension
// land, swap the stub bodies for the real `react-native-live-activities` (or
// equivalent) calls without touching consumers.
//
// To activate: see /native-scaffolds/README.md for the Widget Extension
// + Apple Developer Portal steps and the Swift ActivityAttributes definition.

// Mirror of the Swift ActivityAttributes ContentState that we'll define in
// the Widget Extension target. Keep field names + types in sync — the
// native bridge serializes this object directly into the Swift struct.
export interface GovernanceSweepActivityState {
  title: string;
  progress: number; // 0..1
  claims_processed: number;
  eta_seconds: number;
}

// Opaque token returned by start() and consumed by update()/end(). Once the
// native bridge lands this becomes the iOS activity id (UUID string).
export type ActivityToken = string;

let started = false;

export async function startGovernanceSweepActivity(
  initial: GovernanceSweepActivityState
): Promise<ActivityToken | null> {
  // TODO: bridge to ActivityKit. Pseudocode:
  //   const id = await NativeLiveActivities.start({
  //     activityType: 'GovernanceSweep',
  //     attributes: {},
  //     contentState: initial,
  //   });
  //   return id;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[liveActivities] start (stub):', initial);
  }
  started = true;
  return null;
}

export async function updateGovernanceSweepActivity(
  token: ActivityToken | null,
  next: Partial<GovernanceSweepActivityState>
): Promise<void> {
  // TODO: bridge to ActivityKit:
  //   await NativeLiveActivities.update(token, next);
  if (__DEV__ && started) {
    // eslint-disable-next-line no-console
    console.log('[liveActivities] update (stub):', token, next);
  }
}

export async function endGovernanceSweepActivity(
  token: ActivityToken | null,
  final?: Partial<GovernanceSweepActivityState>
): Promise<void> {
  // TODO: bridge to ActivityKit:
  //   await NativeLiveActivities.end(token, final);
  if (__DEV__ && started) {
    // eslint-disable-next-line no-console
    console.log('[liveActivities] end (stub):', token, final);
  }
  started = false;
}

// True once the Widget Extension target ships and the native bridge is
// wired. Call sites can fall back to in-app banners until then.
export function isLiveActivitiesAvailable(): boolean {
  return false;
}
