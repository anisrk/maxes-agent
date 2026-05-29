import type { MarkupFormat } from "./types";

export function detectFormat(input: string): MarkupFormat {
  const t = input.trim();
  if (!t) return "json";

  // XML: starts with a tag
  if (t.startsWith("<")) return "xml";

  // JSON: starts with { or [
  if (t.startsWith("{") || t.startsWith("[")) return "json";

  // TOML: first meaningful line uses key = value (= not :)
  const firstLine = t.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  if (/^[\w.-]+\s*=/.test(firstLine.trim())) return "toml";

  // Default to YAML
  return "yaml";
}
