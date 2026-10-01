import { sha256Hex } from "./hash";
import { collapseWhitespace, pyStrip } from "./text";
import type { Message, Role } from "./types";

const ROLES = new Set<string>(["system", "user", "assistant"]);

/** Port of canonical_messages. Returns null when the row cannot be used. */
export function canonicalMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value)) return null;
  const messages: Message[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const rec = item as Record<string, unknown>;
    const rawRole = rec.role === undefined ? "" : rec.role;
    if (typeof rawRole !== "string") return null;
    const role = pyStrip(rawRole).toLowerCase();
    const content = rec.content;
    if (!ROLES.has(role) || typeof content !== "string") return null;
    const collapsed = collapseWhitespace(content);
    if (!collapsed) return null;
    messages.push({ role: role as Role, content: collapsed });
  }
  if (messages.length === 0) return null;
  if (!messages.some((m) => m.role === "user") || !messages.some((m) => m.role === "assistant")) return null;
  return messages;
}

/** json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":")) */
export function canonicalJson(messages: Message[]): string {
  return "[" + messages.map((m) => `{"content":${JSON.stringify(m.content)},"role":${JSON.stringify(m.role)}}`).join(",") + "]";
}

export function exampleId(messages: Message[]): string {
  return sha256Hex(canonicalJson(messages));
}

/** Same rows as canonicalMessages accepts, but content is left exactly as written (roles are normalised). */
export function keepMessages(value: unknown): Message[] | null {
  if (canonicalMessages(value) === null) return null;
  return (value as Record<string, unknown>[]).map((item) => ({
    role: pyStrip(item.role === undefined ? "" : (item.role as string)).toLowerCase() as Role,
    content: item.content as string,
  }));
}
