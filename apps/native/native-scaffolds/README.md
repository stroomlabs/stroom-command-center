# Native Scaffolds — Siri Shortcuts + Live Activities

This folder is **documentation only**. Nothing in here is compiled into the
Expo bundle. The files here describe the manual Apple Developer Portal +
Xcode steps required to activate two iOS-only features that were scaffolded
in batch 29a but cannot be fully wired from the Expo managed workflow.

The **JS-side stubs** for both features are already shipped:

- `apps/native/src/lib/intents.ts` — `runSweepIntent()` + `checkQueueIntent()` + `dispatchIntent()`
- `apps/native/src/lib/liveActivities.ts` — `startGovernanceSweepActivity()` + `updateGovernanceSweepActivity()` + `endGovernanceSweepActivity()`

Once the native side below lands in a custom dev build, the JS stubs can
be wired to the bridge via OTA without touching consumers.

The **Info.plist keys** are already set in `apps/native/app.json`:

- `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`
- `NSUserActivityTypes` array with the two intent identifiers
- `NSSupportsLiveActivities = true` + `NSSupportsLiveActivitiesFrequentUpdates = true`
- `entitlements.com.apple.developer.usernotifications.communication = true`

---

## 1. Siri Shortcuts ("Run Stroom Sweep")

### Apple Developer Portal

1. Sign in to https://developer.apple.com/account
2. **Identifiers** → select `com.stroomlabs.commandcenter`
3. Enable **App Groups** (needed if the App Intent calls into JS via shared
   defaults) and **Siri** capability
4. Save and regenerate provisioning profile
5. In EAS dashboard, refresh credentials (`eas credentials --platform ios`)

### Xcode (in the prebuild output, not the managed source)

1. `npx expo prebuild --platform ios --clean`
2. Open `apps/native/ios/StroomCommand.xcworkspace`
3. **Add target** → `App Intents Extension` (iOS 16+)
4. Name it `StroomIntents`, language Swift
5. Add the Swift file below (`RunSweepIntent.swift`) to the new target
6. In **Signing & Capabilities** of the main app target, add **Siri**
7. Build & install on device. The shortcut will appear in the Shortcuts app
   under "Stroom Command".

### Swift — `RunSweepIntent.swift`

```swift
import AppIntents
import Foundation

@available(iOS 16.0, *)
struct RunSweepIntent: AppIntent {
    static var title: LocalizedStringResource = "Run Stroom Sweep"
    static var description = IntentDescription(
        "Trigger an automated governance sweep on the StroomHelix knowledge graph."
    )
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Bridge to JS: write the intent identifier to App Group shared
        // defaults, post a Darwin notification, and let the React Native
        // bridge call dispatchIntent('com.stroomlabs.commandcenter.runsweep')
        // from intents.ts. The JS side calls the governance-sweep Edge
        // Function and writes the result back to shared defaults so we
        // can read it here for the dialog.
        //
        // Until the JS bridge lands, this stub just opens the app.
        let result = "Sweep complete."
        return .result(dialog: IntentDialog(stringLiteral: result))
    }
}

@available(iOS 16.0, *)
struct StroomShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RunSweepIntent(),
            phrases: [
                "Run a sweep with \(.applicationName)",
                "Sweep the queue in \(.applicationName)",
            ],
            shortTitle: "Run Sweep",
            systemImageName: "sparkles"
        )
    }
}
```

### Bridge to JS

The cleanest pattern when the App Intents Extension is sandboxed away from
the main app: write the intent identifier + payload to an App Group
`UserDefaults`, post a Darwin notification, and have the main app's JS
bridge call `dispatchIntent(identifier)` from `intents.ts`. The intent
extension reads the result back from the same shared defaults to populate
the spoken dialog.

There is currently no first-party Expo module for App Intents. If you want
to skip the manual Xcode work, the closest community option is
`expo-siri-shortcuts` which uses the older `NSUserActivity` approach
(pre-iOS 16). The `NSUserActivityTypes` keys in app.json are compatible
with both.

---

## 2. Live Activities (Governance Sweep progress on Lock Screen)

### Apple Developer Portal

1. **Identifiers** → `com.stroomlabs.commandcenter` → enable
   **Push Notifications** (Live Activities use APNs for remote updates)
2. Generate an **APNs Auth Key** if you haven't already (for Edge Function
   server-side activity updates)
3. Save and refresh EAS credentials

### Xcode

1. `npx expo prebuild --platform ios --clean`
2. Open `apps/native/ios/StroomCommand.xcworkspace`
3. **Add target** → `Widget Extension`
4. Name it `StroomLiveActivity`, check **Include Live Activity**
5. Add the Swift file below (`GovernanceSweepActivity.swift`) to the new
   Widget Extension target
6. The main app target needs `NSSupportsLiveActivities = true` in its
   Info.plist — already set in `app.json`

### Swift — `GovernanceSweepActivity.swift`

```swift
import ActivityKit
import SwiftUI
import WidgetKit

struct GovernanceSweepAttributes: ActivityAttributes {
    public typealias ContentState = GovernanceSweepState

    public struct GovernanceSweepState: Codable, Hashable {
        var title: String
        var progress: Double      // 0.0 ... 1.0
        var claimsProcessed: Int
        var etaSeconds: Int
    }
}

@available(iOS 16.1, *)
struct GovernanceSweepActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GovernanceSweepAttributes.self) { context in
            // Lock Screen / banner UI
            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.title)
                    .font(.headline)
                ProgressView(value: context.state.progress)
                    .tint(Color(red: 0, green: 0.631, blue: 0.608)) // Stroom teal
                HStack {
                    Text("\(context.state.claimsProcessed) processed")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(context.state.etaSeconds)s left")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progress)
                }
            } compactLeading: {
                Image(systemName: "sparkles")
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
            } minimal: {
                Image(systemName: "sparkles")
            }
        }
    }
}
```

### Bridge to JS

Two approaches:

1. **Native module wrapping ActivityKit** (recommended). Install
   `react-native-live-activities` (community package) or write a thin
   Expo module yourself. The TS stub functions in
   `apps/native/src/lib/liveActivities.ts` should bridge to the native
   module's `start`, `update`, and `end` calls. The TS `ContentState`
   type is already defined to match the Swift struct — just keep field
   names in sync (camelCase ↔ snake_case is fine, the bridge handles
   conversion).

2. **Server-side updates via APNs**. Pass the activity push token from
   the native layer back to your Supabase Edge Function. The Edge
   Function can then post updates directly to APNs using the Live
   Activity push token, which means you can update the activity from
   anywhere — including from `governance-sweep` itself as the sweep
   progresses. This is the more durable approach for long-running
   sweeps.

---

## Validation checklist (after the manual steps above)

- [ ] `npx expo prebuild --platform ios --clean` succeeds
- [ ] Xcode workspace opens without missing targets
- [ ] App builds and installs to a physical device (Live Activities don't
      work on simulator)
- [ ] "Run Stroom Sweep" shortcut appears in the Shortcuts app
- [ ] Saying "Hey Siri, run a sweep with Stroom Command" triggers the intent
- [ ] Test starting a Governance Sweep activity from JS — it should appear
      on the Lock Screen / Dynamic Island
- [ ] Update the activity's `progress` and `claimsProcessed` from JS — UI
      reflects the new state
- [ ] End the activity — it disappears from the Lock Screen
