import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function sha256Hex(s: string): string {
  return bytesToHex(sha256(utf8ToBytes(s)));
}

/** int(sha256(value)[:16 hex chars], 16) */
export function stableInt(value: string): bigint {
  return BigInt("0x" + sha256Hex(value).slice(0, 16));
}
