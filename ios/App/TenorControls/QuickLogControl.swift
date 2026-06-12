// =====================================================================
// QuickLogControl.swift — Control Center tile for Tenor Quick Log
// =====================================================================
// A simple Control Widget. Tapping it fires QuickLogIntent which
// opens the Tenor app to QuickLogScreen (which auto-starts recording).
//
// Requires iOS 18+. Older devices won't see the tile in the picker.
// =====================================================================

import WidgetKit
import SwiftUI
import AppIntents

@available(iOS 18.0, *)
struct QuickLogControl: ControlWidget {
    static let kind: String = "com.tenor.app.QuickLogControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: QuickLogIntent()) {
                Label("Quick Log", systemImage: "waveform")
            }
        }
        .displayName("Quick Log")
        .description("Open Tenor and start recording a quick mood log.")
    }
}

// WidgetBundle is the entry point for the extension. Just the Control
// tile — no LiveActivity, no other widgets.
@available(iOS 18.0, *)
@main
struct TenorControlsBundle: WidgetBundle {
    var body: some Widget {
        QuickLogControl()
    }
}
