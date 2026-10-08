import WidgetKit
import SwiftUI
import UIKit

/// Today's plate on the home screen. Reads what the app last wrote to the shared
/// group (see WidgetBridgePlugin.swift) and shows the next meal. It never
/// fetches anything itself, so it is only as fresh as the last time the app was
/// open, and it says to open the app when the stored plate is not from today.

private let appGroup = "group.com.bentodining.app"
private let plateKey = "plate_v1"

private let navy = Color(red: 0x24 / 255, green: 0x38 / 255, blue: 0x4F / 255)
private let orange = Color(red: 0xFD / 255, green: 0x8F / 255, blue: 0x2A / 255)
private let cream = Color(red: 0xFD / 255, green: 0xEC / 255, blue: 0xD7 / 255)

/// Bento's picture for a mood, drawn by the app wearing whatever the student has
/// on (see syncWidgetMascot in src/lib/widget.js). Returns nil until the app has
/// run once, and the widget simply draws no mascot then. A variable so the
/// layout can be rendered with a stand-in image in tests.
var loadMascot: (String) -> UIImage? = { mood in
    guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("mascot_\(mood).png"),
          let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
}

struct MealLine: Codable {
    let hall: String?
    let items: [String]
    let confirmed: Bool
}

struct StoredPlate: Codable {
    let v: Int
    let date: String          // yyyy-MM-dd, the student's local day when it was written
    let streak: Int?
    let meals: [String: MealLine]
}

enum Meal: String, CaseIterable {
    case breakfast, lunch, dinner

    var title: String { rawValue.capitalized }
    /// The hour a meal stops being "next". Matches MEAL_TIMES in the web app.
    var endHour: Int {
        switch self {
        case .breakfast: return 10
        case .lunch: return 14
        case .dinner: return 20
        }
    }
}

enum PlateState {
    case needsApp
    case meal(title: String, line: MealLine, streak: Int?)
    case finished(streak: Int?)

    var streak: Int? {
        switch self {
        case .needsApp: return nil
        case .finished(let n): return n
        case .meal(_, _, let n): return n
        }
    }

    /// Cheers when the next meal is confirmed, sleeps once the day is done.
    var mood: String {
        switch self {
        case .needsApp: return "happy"
        case .finished: return "sleepy"
        case .meal(_, let line, _): return line.confirmed ? "cheer" : "happy"
        }
    }
}

struct PlateEntry: TimelineEntry {
    let date: Date
    let state: PlateState
}

private func dayString(_ d: Date) -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: d)
}

private func loadPlate() -> StoredPlate? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: plateKey),
          let data = json.data(using: .utf8),
          let plate = try? JSONDecoder().decode(StoredPlate.self, from: data),
          plate.v == 1 else { return nil }
    return plate
}

/// What to show at `date`, given what the app last stored.
func state(at date: Date, plate: StoredPlate?) -> PlateState {
    guard let plate = plate, plate.date == dayString(date) else { return .needsApp }
    let hour = Calendar.current.component(.hour, from: date)
    for meal in Meal.allCases where hour < meal.endHour {
        if let line = plate.meals[meal.rawValue], !line.items.isEmpty {
            return .meal(title: meal.title, line: line, streak: plate.streak)
        }
    }
    return .finished(streak: plate.streak)
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PlateEntry {
        PlateEntry(date: Date(), state: .meal(
            title: "Dinner",
            line: MealLine(hall: "Sherman", items: ["Roasted chicken", "Brown rice", "Green beans"], confirmed: false),
            streak: 5))
    }

    func getSnapshot(in context: Context, completion: @escaping (PlateEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context)
                                     : PlateEntry(date: Date(), state: state(at: Date(), plate: loadPlate())))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PlateEntry>) -> Void) {
        let plate = loadPlate()
        let now = Date()
        let cal = Calendar.current
        // One entry now, then one at each moment the answer changes: when a
        // meal ends, and at midnight when the stored plate stops being today's.
        var moments = [now]
        for hour in [10, 14, 20] {
            if let d = cal.date(bySettingHour: hour, minute: 0, second: 0, of: now), d > now { moments.append(d) }
        }
        if let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) { moments.append(midnight) }
        let entries = moments.map { PlateEntry(date: $0, state: state(at: $0, plate: plate)) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct PlateView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PlateEntry

    private var small: Bool { family == .systemSmall }
    private var streak: Int { max(0, entry.state.streak ?? 0) }
    private var isMeal: Bool { if case .meal = entry.state { return true } else { return false } }

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) { content }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                // Medium keeps the words out of Bento's column on the right.
                .padding(.trailing, small ? 0 : 112)
            overlays
        }
        .widgetBackground()
    }

    /// Where Bento and the streak go.
    ///  Small, with a meal: Bento in the top-right corner beside the title, so the
    ///    dishes below get the full width. The streak lives in the text's bottom row.
    ///  Small, any other state: Bento bottom-right, streak bottom-left.
    ///  Medium: Bento in a column on the right with the streak under him.
    @ViewBuilder
    private var overlays: some View {
        if small {
            if isMeal {
                // Nudged out into the corner so he lines up with the title, not the dishes.
                mascot(height: 44)
                    .offset(x: 6, y: -8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else {
                mascot(height: 52).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                if streak > 0 {
                    streakLabel(streak).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }
        } else {
            VStack(spacing: 3) {
                mascot(height: streak > 0 ? 96 : 108)
                if streak > 0 { streakLabel(streak) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
    }

    @ViewBuilder
    private func mascot(height: CGFloat) -> some View {
        if let image = loadMascot(entry.state.mood) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch entry.state {
        case .needsApp:
            message(title: "Today's plate", body: "Open Bento to build it.")
        case .finished:
            message(title: "Done for today", body: "See you tomorrow.")
        case .meal(let title, let line, _):
            mealText(title: title, line: line)
        }
    }

    private func message(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline).foregroundColor(navy)
            Text(body).font(.subheadline).foregroundColor(navy.opacity(0.7))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func streakLabel(_ n: Int) -> some View {
        Text("🔥 \(n) day\(n == 1 ? "" : "s")")
            .font(.caption.weight(.semibold))
            .foregroundColor(orange)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    /// The meal, with as many dishes as fit. How many fit depends on the device,
    /// the widget size and the student's text size, so rather than guess a count
    /// the widget tries the longest version first and falls back to shorter ones
    /// until one fits the height it was given. Before iOS 16 there is no way to
    /// ask, so it shows a count that fits everywhere.
    @ViewBuilder
    private func mealText(title: String, line: MealLine) -> some View {
        if #available(iOS 16.0, *) {
            if small {
                ViewThatFits(in: .vertical) {
                    column(title, line, limit: 3)
                    column(title, line, limit: 2)
                    column(title, line, limit: 1)
                    column(title, line, limit: 0)
                }
            } else {
                ViewThatFits(in: .vertical) {
                    column(title, line, limit: 4)
                    column(title, line, limit: 3)
                    column(title, line, limit: 2)
                    column(title, line, limit: 1)
                    column(title, line, limit: 0)
                }
            }
        } else {
            column(title, line, limit: small ? 2 : 3)
        }
    }

    private func column(_ title: String, _ line: MealLine, limit: Int) -> some View {
        let shown = Array(line.items.prefix(limit))
        let extra = line.items.count - shown.count
        let moreText = shown.isEmpty ? "\(extra) dish\(extra == 1 ? "" : "es")" : "+\(extra) more"
        return VStack(alignment: .leading, spacing: 3) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(title).font(.headline).foregroundColor(navy).lineLimit(1).minimumScaleFactor(0.7)
                    if line.confirmed {
                        // A tick in the narrow widget, the word where there is room.
                        if small {
                            Image(systemName: "checkmark.circle.fill").font(.caption).foregroundColor(.green)
                        } else {
                            Text("Confirmed").font(.caption2.weight(.bold)).foregroundColor(.green).lineLimit(1)
                        }
                    }
                }
                if let hall = line.hall, !hall.isEmpty {
                    Text(hall).font(.caption).foregroundColor(orange).lineLimit(1)
                }
            }
            // Beside Bento in the small widget, so these two lines leave his corner clear.
            .padding(.trailing, small ? 44 : 0)
            ForEach(shown, id: \.self) { item in
                Text(item).font(.footnote).foregroundColor(navy).lineLimit(1)
            }
            if small {
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline) {
                    if streak > 0 { streakLabel(streak).layoutPriority(1) }
                    Spacer(minLength: 4)
                    if extra > 0 {
                        Text(moreText).font(.caption2).foregroundColor(navy.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
            } else if extra > 0 {
                Text(moreText).font(.caption2).foregroundColor(navy.opacity(0.6)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

extension View {
    /// containerBackground is iOS 17 and later. Earlier systems draw the colour
    /// themselves.
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(cream, for: .widget)
        } else {
            self.padding().background(cream)
        }
    }
}

// MARK: - Buddies at the hall
//
// A second widget: the buddies who have tapped "I'm here", with the hall and the time.
// Unlike the plate it fetches its own list, because a buddy can arrive while the app is
// closed. It carries a read-only token (made by duo_widget_token, migration 046) that can
// do one thing, read this list, and the app puts it in the shared group. The last answer
// is kept so the widget still shows something with no signal, and every row drops out at
// the moment its tap ends, even if no new answer has arrived.

private let buddyTokenKey = "buddy_token_v1"
private let buddyLastKey = "buddy_last_v1"
private let buddiesURL = URL(string: "https://www.bentodining.com/api/duo-widget")!

struct Buddy: Codable, Identifiable {
    let name: String
    let hall: String
    let meal: String
    let at: Date
    let until: Date
    let outfit: String?
    let color: String?

    var id: String { "\(name)-\(at.timeIntervalSince1970)" }
    /// The picture file for this buddy's Bento, written by the app (see setBuddyMascot).
    var pictureKey: String { "\(outfit ?? "none")_\(color ?? "classic")" }
}

struct BuddyAnswer: Codable {
    let buddies: [Buddy]
}

enum BuddiesState {
    case setup                 // no token yet, or it was revoked
    case unavailable           // no answer and nothing saved
    case list([Buddy])
}

struct BuddiesEntry: TimelineEntry {
    let date: Date
    let state: BuddiesState
}

/// The server sends ISO 8601 times, with fractional seconds.
private func decodeBuddies(_ data: Data) -> [Buddy]? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { d in
        let text = try d.singleValueContainer().decode(String.self)
        if let date = withFraction.date(from: text) ?? plain.date(from: text) { return date }
        throw DecodingError.dataCorrupted(.init(codingPath: d.codingPath, debugDescription: "bad date"))
    }
    return (try? decoder.decode(BuddyAnswer.self, from: data))?.buddies
}

private func cachedBuddies() -> [Buddy]? {
    guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: buddyLastKey) else { return nil }
    return decodeBuddies(data)
}

/// Buddies whose tap is still running at `date`, newest first.
func liveBuddies(_ all: [Buddy], at date: Date) -> [Buddy] {
    all.filter { $0.until > date }.sorted { $0.at > $1.at }
}

/// A buddy's Bento, or nil until the app has drawn it. A variable so a test can
/// stand in an image.
var loadBuddyPicture: (String) -> UIImage? = { key in
    guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("buddy_\(key).png"),
          let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
}

struct BuddiesProvider: TimelineProvider {
    private static let sample = [
        Buddy(name: "Maya", hall: "Usdan", meal: "lunch", at: Date(), until: Date().addingTimeInterval(3000), outfit: nil, color: "cherry"),
        Buddy(name: "Sam", hall: "Sherman", meal: "lunch", at: Date().addingTimeInterval(-600), until: Date().addingTimeInterval(2400), outfit: "scarf", color: nil),
    ]

    func placeholder(in context: Context) -> BuddiesEntry {
        BuddiesEntry(date: Date(), state: .list(Self.sample))
    }

    func getSnapshot(in context: Context, completion: @escaping (BuddiesEntry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        let now = Date()
        let saved = cachedBuddies()
        completion(BuddiesEntry(date: now, state: saved.map { .list(liveBuddies($0, at: now)) } ?? .setup))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BuddiesEntry>) -> Void) {
        let now = Date()
        let retry = now.addingTimeInterval(15 * 60)
        guard let token = UserDefaults(suiteName: appGroup)?.string(forKey: buddyTokenKey), !token.isEmpty else {
            completion(Timeline(entries: [BuddiesEntry(date: now, state: .setup)], policy: .after(now.addingTimeInterval(30 * 60))))
            return
        }
        var request = URLRequest(url: buddiesURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 {
                completion(Timeline(entries: [BuddiesEntry(date: now, state: .setup)], policy: .after(retry)))
                return
            }
            var list: [Buddy]? = nil
            if status == 200, let data = data, let fresh = decodeBuddies(data) {
                list = fresh
                UserDefaults(suiteName: appGroup)?.set(data, forKey: buddyLastKey)
            }
            if list == nil { list = cachedBuddies() }       // no signal: the last answer, with ended taps dropped
            guard let all = list else {
                completion(Timeline(entries: [BuddiesEntry(date: now, state: .unavailable)], policy: .after(retry)))
                return
            }
            // One entry now and one at each moment a tap ends, so a buddy leaves the
            // list on time even if no new answer arrives.
            var moments = [now]
            moments += all.map { $0.until }.filter { $0 > now }
            let unique = Array(Set(moments)).sorted().prefix(8)
            let entries = unique.map { BuddiesEntry(date: $0, state: .list(liveBuddies(all, at: $0))) }
            completion(Timeline(entries: Array(entries), policy: .after(retry)))
        }.resume()
    }
}

private func clockText(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "h:mm"
    return f.string(from: d)
}

struct BuddiesView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BuddiesEntry

    private var small: Bool { family == .systemSmall }
    private var limit: Int { small ? 2 : 4 }

    var body: some View {
        VStack(alignment: .leading, spacing: small ? 6 : 8) {
            Text("At the hall")
                .font(.caption.weight(.bold))
                .foregroundColor(orange)
                .lineLimit(1)
            switch entry.state {
            case .setup:
                note("Open Bento to set this up.")
            case .unavailable:
                note("Can't check right now.")
            case .list(let buddies):
                if buddies.isEmpty {
                    note("No buddies out right now.")
                } else {
                    ForEach(Array(buddies.prefix(limit))) { row($0) }
                    if buddies.count > limit {
                        Text("+\(buddies.count - limit) more")
                            .font(.caption2)
                            .foregroundColor(navy.opacity(0.6))
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetBackground()
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundColor(navy).lineLimit(3)
    }

    private func row(_ b: Buddy) -> some View {
        HStack(spacing: 8) {
            avatar(b, size: small ? 28 : 34)
            VStack(alignment: .leading, spacing: 0) {
                Text(b.name).font(.footnote.weight(.bold)).foregroundColor(navy).lineLimit(1)
                Text("\(b.hall), \(b.meal), \(clockText(b.at))")
                    .font(.caption2)
                    .foregroundColor(navy.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }

    @ViewBuilder
    private func avatar(_ b: Buddy, size: CGFloat) -> some View {
        if let image = loadBuddyPicture(b.pictureKey) {
            Image(uiImage: image).resizable().scaledToFit().frame(height: size)
        } else {
            ZStack {
                Circle().fill(orange)
                Text(String(b.name.prefix(1)).uppercased())
                    .font(.caption.weight(.heavy))
                    .foregroundColor(.white)
            }
            .frame(width: size, height: size)
        }
    }
}

struct BentoBuddiesWidget: Widget {
    let kind = "BentoBuddiesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BuddiesProvider()) { entry in
            BuddiesView(entry: entry)
        }
        .configurationDisplayName("Buddies at the hall")
        .description("Which buddies are at a dining hall right now.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct BentoPlateWidget: Widget {
    let kind = "BentoPlateWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PlateView(entry: entry)
        }
        .configurationDisplayName("Today's plate")
        .description("Your next meal from Bento's plate.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct BentoWidgets: WidgetBundle {
    var body: some Widget {
        BentoPlateWidget()
        BentoBuddiesWidget()
    }
}
