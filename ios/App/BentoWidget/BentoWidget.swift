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
                mascot(height: 38).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
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

@main
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
