import { describe, expect, it } from "vitest";
import { formatRecord, parseRecordMetadata } from "../src/record-format.js";

describe("mobile Git record format", () => {
  it("round-trips contribution metadata and Markdown", () => {
    const content = formatRecord(
      {
        id: "6eca8c70-42db-44c6-9096-5f682dfecc09",
        subject: "alex",
        visibility: "confidential",
        contributorClass: "subject",
        contributedAt: "2026-08-23T18:00:00.000Z",
        updatedAt: "2026-08-23T18:00:00.000Z",
      },
      "A title",
      "The durable body.",
    );
    expect(content).toContain("# A title\n\nThe durable body.");
    expect(parseRecordMetadata(content)).toMatchObject({
      subject: "alex",
      visibility: "confidential",
      contributorClass: "subject",
    });
  });
});
