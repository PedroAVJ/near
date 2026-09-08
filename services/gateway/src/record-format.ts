import { GatewayError } from "./errors.js";
import type { Visibility } from "./types.js";

export interface RecordMetadata {
  id: string;
  subject: string;
  visibility: Visibility;
  contributorClass: "subject" | "known-person" | "agent";
  contributedAt: string;
  updatedAt: string;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function formatRecord(
  metadata: RecordMetadata,
  title: string,
  body: string,
): string {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || !cleanBody) {
    throw new GatewayError(400, "empty_record", "A title and body are required.");
  }
  return [
    "---",
    `near_id: ${yamlString(metadata.id)}`,
    `subject: ${yamlString(metadata.subject)}`,
    `visibility: ${metadata.visibility}`,
    `contributor_class: ${metadata.contributorClass}`,
    `contributed_at: ${yamlString(metadata.contributedAt)}`,
    `updated_at: ${yamlString(metadata.updatedAt)}`,
    "---",
    "",
    `# ${cleanTitle.replace(/\r?\n/g, " ")}`,
    "",
    cleanBody,
    "",
  ].join("\n");
}

export function parseRecordMetadata(content: string): RecordMetadata {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
  if (!match?.[1]) {
    throw new GatewayError(409, "invalid_mobile_record", "That file is missing Near metadata.");
  }
  const values = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    let value = raw;
    if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw) as string;
      } catch {
        throw new GatewayError(409, "invalid_mobile_record", "That file has invalid Near metadata.");
      }
    }
    values.set(key, value);
  }

  const id = values.get("near_id");
  const subject = values.get("subject");
  const visibility = values.get("visibility");
  const contributorClass = values.get("contributor_class");
  const contributedAt = values.get("contributed_at");
  const updatedAt = values.get("updated_at");
  if (
    !id ||
    !subject ||
    (visibility !== "public" && visibility !== "confidential") ||
    (contributorClass !== "subject" && contributorClass !== "known-person" && contributorClass !== "agent") ||
    !contributedAt ||
    !updatedAt
  ) {
    throw new GatewayError(409, "invalid_mobile_record", "That file has incomplete Near metadata.");
  }
  return { id, subject, visibility, contributorClass, contributedAt, updatedAt };
}
