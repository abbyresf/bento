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
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.com.bentodining.app"
    static let key = "plate_v1"

    @objc func setPlate(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("json is required")
            return
        }
        UserDefaults(suiteName: Self.group)?.set(json, forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Called on sign out so one student's plate never shows for the next.
    @objc func clear(_ call: CAPPluginCall) {
        UserDefaults(suiteName: Self.group)?.removeObject(forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
