import SwiftUI

@main
struct NearApp: App {
    @StateObject private var model: NearAppModel

    init() {
        let demo = ProcessInfo.processInfo.arguments.contains("--demo")
        let repository: any NearRepository = demo ? DemoNearRepository() : GatewayNearRepository()
        _model = StateObject(wrappedValue: NearAppModel(repository: repository))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .task { await model.bootstrap() }
        }
    }
}
