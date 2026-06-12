// =====================================================================
// TenorAppIntent.swift — Tenor's system-discoverable App Intents
// =====================================================================
// One intent, surfaced via the system's standard entry points:
//   • Shortcuts app gallery (under "Tenor")
//   • Control Center custom controls (via TenorControlsExtension)
//   • Spotlight search + Siri ("quick log on Tenor")
//   • Action Button picker (iPhone 15 Pro+)
//
// How the trigger reaches QuickLogScreen:
//   1. `openAppWhenRun: true` brings Tenor to foreground.
//   2. `perform()` writes a flag to App Group UserDefaults so the host
//      app knows the launch was a quick-log trigger (vs. a normal open).
//   3. AppDelegate's `applicationDidBecomeActive` reads the flag and
//      dispatches a `tenor:quicklog` JS event into the WKWebView. App.tsx
//      listens for that event and routes to QuickLogScreen.
//
// We don't return `OpensIntent`/`OpenURLIntent` because iOS ignores
// that when `openAppWhenRun` is true. The App Group flag + bridge
// dispatch is reliable on both Personal Team and paid signing.
//
// File is added to BOTH the main App target AND the TenorControlsExtension
// target via the File Inspector's Target Membership section.
// =====================================================================

import AppIntents
import Foundation

// Single source of truth for the App Group identifier + the flag key.
// Both Swift sides (intent + AppDelegate observer) read/write through
// this enum so a rename or typo is caught at compile time.
public enum TenorAppGroup {
    public static let suiteName = "group.com.tenor.app"
    public static let shouldStartQuickLogKey = "tenor.shouldStartQuickLog"
}

@available(iOS 18.0, *)
struct QuickLogIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Log"
    static var description: IntentDescription = IntentDescription(
        "Open Tenor and start a hands-free voice log."
    )

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: TenorAppGroup.suiteName)
        defaults?.set(true, forKey: TenorAppGroup.shouldStartQuickLogKey)
        return .result()
    }
}

@available(iOS 18.0, *)
struct TenorAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: QuickLogIntent(),
            phrases: [
                "Quick log on \(.applicationName)",
                "Start a quick log on \(.applicationName)",
                "Open \(.applicationName) and log",
            ],
            shortTitle: "Quick Log",
            systemImageName: "waveform"
        )
    }
}
