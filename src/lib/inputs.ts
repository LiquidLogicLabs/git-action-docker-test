import * as core from "@actions/core";

export const DEFAULT_MINIMAL_ENV = {
  PUID: "1000",
  PGID: "1000",
  TZ: "UTC"
};

// Parse boolean inputs from GitHub Actions (string-based).
export function parseBoolean(value: string | undefined, fallback = false, name?: string): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (name) {
    throw new Error(`Invalid ${name}: expected 'true' or 'false'`);
  }
  throw new Error("Invalid boolean input: expected 'true' or 'false'");
}

// Parse positive integer inputs with a fallback.
export function parseNumber(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  return parsed;
}

// Prefer camelCase inputs, fall back to legacy snake_case.
export function getInputWithFallback(name: string, legacyName?: string): string {
  const primary = core.getInput(name);
  if (primary) return primary;
  if (legacyName) return core.getInput(legacyName);
  return "";
}

// Parse a JSON object input (string->string map) with defaults on failure.
export function parseJsonObject(input: string, name: string): Record<string, string> {
  if (!input) return { ...DEFAULT_MINIMAL_ENV };
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid ${name}: expected a JSON object`);
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      result[key] = String(value);
    }
    return result;
  } catch {
    throw new Error(`Invalid ${name}: expected a JSON object`);
  }
}

// Parse a JSON array input; invalid payloads are ignored with a warning.
export function parseJsonArray(input: string, name: string): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid ${name}: expected a JSON array`);
    }
    return parsed.map((value) => String(value)).filter((value) => value.length > 0);
  } catch {
    throw new Error(`Invalid ${name}: expected a JSON array`);
  }
}
