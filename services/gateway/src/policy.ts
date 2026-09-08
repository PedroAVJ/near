import path from "node:path";
import { GatewayError } from "./errors.js";
import type { Visibility } from "./types.js";

const publicRoot = "public/";
const editableRoots = ["public/mobile/", "confidential/mobile/"] as const;
const readableExtensions = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml"]);

export function normalizeRepositoryPath(candidate: string): string {
  if (!candidate || candidate.includes("\0") || candidate.startsWith("/")) {
    throw new GatewayError(400, "invalid_path", "That file path is not valid.");
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new GatewayError(400, "invalid_path", "That file path is not valid.");
  }
  return normalized;
}

export function isReadableRecordPath(candidate: string): boolean {
  const normalized = normalizeRepositoryPath(candidate);
  return readableExtensions.has(path.posix.extname(normalized).toLowerCase());
}

export function assertReadablePath(candidate: string, publicOnly: boolean): string {
  const normalized = normalizeRepositoryPath(candidate);
  if (!isReadableRecordPath(normalized)) {
    throw new GatewayError(415, "unsupported_record", "Near can open text records only.");
  }
  if (publicOnly && !normalized.startsWith(publicRoot)) {
    throw new GatewayError(403, "confidential_path", "That path is not public.");
  }
  return normalized;
}

export function visibilityForPath(candidate: string): Visibility {
  return normalizeRepositoryPath(candidate).startsWith(publicRoot) ? "public" : "confidential";
}

export function assertEditableMobilePath(candidate: string): string {
  const normalized = assertReadablePath(candidate, false);
  if (!editableRoots.some((root) => normalized.startsWith(root))) {
    throw new GatewayError(403, "record_read_only", "Only iPhone-authored files can be edited here.");
  }
  return normalized;
}

export function mobileRoot(visibility: Visibility): string {
  return visibility === "public" ? "public/mobile" : "confidential/mobile";
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "note";
}
