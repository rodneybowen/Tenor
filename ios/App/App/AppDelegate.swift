import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Make the WKWebView transparent and tint the window cream so
        // that with contentInset: 'never' + viewport-fit=cover, any
        // safe-area gap below the webview shows neutral aurora-adjacent
        // color, not default white.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.tintWebViewBackdrop()
        }
        self.window?.backgroundColor = UIColor(red: 244/255.0, green: 242/255.0, blue: 240/255.0, alpha: 1.0)
        return true
    }

    private func tintWebViewBackdrop() {
        guard let root = self.window?.rootViewController else { return }
        if let webView = findWebView(in: root.view) {
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear
        }
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let w = view as? WKWebView { return w }
        for sub in view.subviews {
            if let w = findWebView(in: sub) { return w }
        }
        return nil
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // When the app comes to foreground (cold launch via Quick Log
        // tile OR resumed from background), check the App Group flag
        // that the tile's AppIntent writes. If set, dispatch a window
        // event into the WKWebView so App.tsx routes to QuickLogScreen.
        if #available(iOS 18.0, *) {
            checkQuickLogFlag()
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    @available(iOS 18.0, *)
    private func checkQuickLogFlag() {
        let defaults = UserDefaults(suiteName: TenorAppGroup.suiteName)
        guard defaults?.bool(forKey: TenorAppGroup.shouldStartQuickLogKey) == true else {
            return
        }
        // Consume the flag so a future "normal" open doesn't re-trigger.
        defaults?.set(false, forKey: TenorAppGroup.shouldStartQuickLogKey)
        print("[QuickLog] flag detected — dispatching JS event")

        // Wait a tick for the WKWebView to finish loading. Capacitor's
        // initial JS load can take 100–300ms on a cold launch; firing
        // the event too early means App.tsx hasn't registered its
        // listener yet. 600ms gives a comfortable margin without
        // feeling laggy. If the listener IS already attached (warm
        // resume), the event fires nearly immediately anyway.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.dispatchQuickLogEvent()
        }
    }

    private func dispatchQuickLogEvent() {
        guard let root = self.window?.rootViewController else {
            print("[QuickLog] no rootViewController, cannot dispatch")
            return
        }
        guard let webView = findWebView(in: root.view) else {
            print("[QuickLog] no WKWebView found, cannot dispatch")
            return
        }
        let js = "window.dispatchEvent(new CustomEvent('tenor:quicklog'))"
        webView.evaluateJavaScript(js) { _, error in
            if let error = error {
                print("[QuickLog] JS dispatch error: \(error.localizedDescription)")
            } else {
                print("[QuickLog] JS event dispatched")
            }
        }
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
