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
        CAPPluginMethod(name: "setBuddyToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBuddyToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBuddyMascot", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.com.bentodining.app"
    static let key = "plate_v1"
    static let moods = ["happy", "cheer", "sleepy"]

    // The buddy list widget. It fetches its own list, so all it needs from the app is a
    // read-only token (64 hex characters, made by duo_widget_token) and a picture of each
    // buddy's Bento, one file per outfit and color. See SOCIAL_SPEC.md section 7a.
    static let buddyTokenKey = "buddy_token_v1"
    static let buddyLastKey = "buddy_last_v1"
    static let buddyFilePrefix = "buddy_"
    static let maxBuddyFiles = 60

    static func isToken(_ s: String) -> Bool {
        s.count == 64 && s.allSatisfy { $0.isHexDigit && ($0.isNumber || $0.isLowercase) }
    }

    /// Picture keys look like "chefhat_sky". Letters, digits and underscores only, so a key
    /// from the web view can never name a path.
    static func isBuddyKey(_ s: String) -> Bool {
        !s.isEmpty && s.count <= 40 && s.allSatisfy { ($0.isLetter && $0.isLowercase && $0.isASCII) || ($0.isNumber && $0.isASCII) || $0 == "_" }
    }

    static func groupURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    }

    static func buddyFiles() -> [URL] {
        guard let dir = groupURL(),
              let all = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return [] }
        return all.filter { $0.lastPathComponent.hasPrefix(buddyFilePrefix) && $0.pathExtension == "png" }
    }

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

    /// Stores the widget token. Only a well-formed token is accepted, since the string
    /// comes from the web view.
    @objc func setBuddyToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), Self.isToken(token) else {
            call.reject("a 64 character hex token is required")
            return
        }
        UserDefaults(suiteName: Self.group)?.set(token, forKey: Self.buddyTokenKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// The stored token, or an empty string. The web layer uses it to revoke the token
    /// at sign out and to know whether this phone still needs one.
    @objc func getBuddyToken(_ call: CAPPluginCall) {
        let token = UserDefaults(suiteName: Self.group)?.string(forKey: Self.buddyTokenKey) ?? ""
        call.resolve(["token": token])
    }

    /// One picture of a buddy's Bento. The key names the outfit and color, so two buddies
    /// who look alike share a file. Capped in size and in how many are kept.
    @objc func setBuddyMascot(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), Self.isBuddyKey(key),
              let base64 = call.getString("base64"),
              base64.count < 400_000,
              let data = Data(base64Encoded: base64),
              let dir = Self.groupURL() else {
            call.reject("a short lowercase key and a PNG under 300 KB are required")
            return
        }
        let url = dir.appendingPathComponent("\(Self.buddyFilePrefix)\(key).png")
        do {
            try data.write(to: url, options: .atomic)
            let files = Self.buddyFiles()
            if files.count > Self.maxBuddyFiles {
                let dated = files.map { ($0, (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
                for (old, _) in dated.sorted(by: { $0.1 < $1.1 }).prefix(files.count - Self.maxBuddyFiles) {
                    try? FileManager.default.removeItem(at: old)
                }
            }
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
        // The buddy list too: the token, the last answer and every buddy picture.
        for url in Self.buddyFiles() { try? FileManager.default.removeItem(at: url) }
        UserDefaults(suiteName: Self.group)?.removeObject(forKey: Self.buddyTokenKey)
        UserDefaults(suiteName: Self.group)?.removeObject(forKey: Self.buddyLastKey)
        UserDefaults(suiteName: Self.group)?.removeObject(forKey: Self.key)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
