import Capacitor
import WidgetKit

/// Hands today's plate from the web layer to the home-screen widget.
///
/// The widget is a separate process and cannot read the web view's storage, so
/// the web layer writes a small JSON string here and this puts it in the shared
/// app group, then asks WidgetKit to redraw. Only meal names, the dining hall and
/// the streak count go across. No ids, no nutrition numbers, no account details.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setPlate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMascot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.com.bentodining.app"
    static let key = "plate_v1"
    static let moods = ["happy", "cheer", "sleepy"]

    /// Where the widget looks for Bento's picture, one file per mood.
    static func mascotURL(_ mood: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("mascot_\(mood).png")
    }

    @objc func setPlate(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }
        UserDefaults(suiteName: Self.group)?.set(json, forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Stores one picture of Bento, drawn by the web layer wearing whatever the
    /// student has on. Only the three known moods are accepted and the size is
    /// capped, since the string comes from the web view.
    @objc func setMascot(_ call: CAPPluginCall) {
        guard let mood = call.getString("mood"), Self.moods.contains(mood),
              let base64 = call.getString("base64"),
              base64.count < 700_000,
              let data = Data(base64Encoded: base64),
              let url = Self.mascotURL(mood) else {
            call.reject("a known mood and a PNG under 500 KB are required")
            return
        }
        do {
            try data.write(to: url, options: .atomic)
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } catch {
            call.reject("could not store the picture")
        }
    }

    /// Called on sign out so one student's plate never shows for the next.
    @objc func clear(_ call: CAPPluginCall) {
        for mood in Self.moods {
            if let url = Self.mascotURL(mood) { try? FileManager.default.removeItem(at: url) }
        }
        UserDefaults(suiteName: Self.group)?.removeObject(forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
