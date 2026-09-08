import SwiftUI

enum NearTheme {
    static let bone = Color(red: 250 / 255, green: 249 / 255, blue: 245 / 255)
    static let sunken = Color(red: 242 / 255, green: 241 / 255, blue: 235 / 255)
    static let selected = Color(red: 232 / 255, green: 230 / 255, blue: 222 / 255)
    static let card = Color.white
    static let ink = Color(red: 22 / 255, green: 21 / 255, blue: 15 / 255)
    static let inkSecondary = Color(red: 94 / 255, green: 92 / 255, blue: 85 / 255)
    static let inkMuted = Color(red: 140 / 255, green: 138 / 255, blue: 128 / 255)
    static let line = Color(red: 220 / 255, green: 218 / 255, blue: 208 / 255)
    static let lineStrong = Color(red: 198 / 255, green: 195 / 255, blue: 182 / 255)
    static let signal = Color(red: 196 / 255, green: 50 / 255, blue: 42 / 255)
    static let signalTint = Color(red: 247 / 255, green: 231 / 255, blue: 228 / 255)
    static let moss = Color(red: 74 / 255, green: 107 / 255, blue: 76 / 255)
    static let mossTint = Color(red: 231 / 255, green: 237 / 255, blue: 229 / 255)
    static let slate = Color(red: 63 / 255, green: 90 / 255, blue: 120 / 255)
    static let slateTint = Color(red: 228 / 255, green: 234 / 255, blue: 241 / 255)
}

struct NearStructuralLabel: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .tracking(1.1)
            .foregroundStyle(NearTheme.inkMuted)
            .accessibilityAddTraits(.isHeader)
    }
}

struct NearWordmark: View {
    var suffix: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("near")
                .font(.system(size: 28, weight: .light, design: .default))
                .tracking(-1)
            if let suffix {
                Text(suffix)
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(NearTheme.inkMuted)
            }
        }
        .foregroundStyle(NearTheme.ink)
        .accessibilityElement(children: .combine)
    }
}

struct NearCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(NearTheme.card)
            .overlay {
                RoundedRectangle(cornerRadius: 3)
                    .stroke(NearTheme.line, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

struct NearDotGrid: View {
    var body: some View {
        Canvas { context, size in
            let color = NearTheme.line.opacity(0.7)
            for x in stride(from: 8.0, through: size.width, by: 16) {
                for y in stride(from: 8.0, through: size.height, by: 16) {
                    context.fill(
                        Path(ellipseIn: CGRect(x: x, y: y, width: 1.3, height: 1.3)),
                        with: .color(color)
                    )
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct VisibilityMark: View {
    let visibility: EntryVisibility

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(visibility == .confidential ? NearTheme.moss : NearTheme.slate)
                .frame(width: 6, height: 6)
            Text(visibility.title)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(NearTheme.inkMuted)
        }
        .accessibilityElement(children: .combine)
    }
}

struct SignalButtonLabel: View {
    let title: String
    let systemImage: String?

    init(_ title: String, systemImage: String? = nil) {
        self.title = title
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: 7) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .medium))
            }
            Text(title)
                .font(.system(size: 14, weight: .medium))
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 14)
        .frame(minHeight: 40)
        .background(NearTheme.signal)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

extension View {
    func nearPage() -> some View {
        background(NearTheme.bone.ignoresSafeArea())
            .foregroundStyle(NearTheme.ink)
    }
}
