import XCTest

final class NearUITests: XCTestCase {
    func testDemoOpensGitFileBrowser() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Hablar"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Cuéntale algo a Near…"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["Hablar"].exists)

        app.tabBars.buttons["Files"].tap()
        XCTAssertTrue(app.staticTexts["how-i-like-plans.md"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["context/how-i-like-plans.md"].exists)

        app.tabBars.buttons["Ask"].tap()
        XCTAssertTrue(app.staticTexts["QUESTION SCOPE"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["READ, NOT CANON"].waitForExistence(timeout: 5))

        app.tabBars.buttons["People"].tap()
        XCTAssertTrue(app.staticTexts["Sam"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["public/ only"].waitForExistence(timeout: 5))
    }
}
