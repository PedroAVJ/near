import XCTest
@testable import Near

final class NearRecordParserTests: XCTestCase {
    func testMobileRecordSeparatesMetadataTitleAndBody() {
        let content = """
        ---
        near_id: "6eca8c70-42db-44c6-9096-5f682dfecc09"
        subject: "alex"
        visibility: confidential
        contributor_class: subject
        contributed_at: "2026-08-23T18:00:00Z"
        updated_at: "2026-08-23T18:00:00Z"
        ---

        # A title

        A durable body.
        """

        let parsed = NearRecordParser.editorContent(from: content)
        XCTAssertEqual(parsed.recordID, "6eca8c70-42db-44c6-9096-5f682dfecc09")
        XCTAssertEqual(parsed.title, "A title")
        XCTAssertEqual(parsed.body, "A durable body.")
    }

    func testLegacyMarkdownRemainsReadableWithoutBecomingEditableRecord() {
        let parsed = NearRecordParser.editorContent(from: "# Existing record\n\nPreserve the path and history.")
        XCTAssertNil(parsed.recordID)
        XCTAssertEqual(parsed.title, "Existing record")
        XCTAssertEqual(parsed.body, "Preserve the path and history.")
    }
}
