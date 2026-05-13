import { uint8ToBase64 } from "@/lib/binary";

export function byteaToBase64(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Uint8Array) {
    return uint8ToBase64(value);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("base64");
  }
  if (typeof value === "string") {
    if (value.startsWith("\\x")) {
      const hex = value.slice(2);
      if (typeof Buffer !== "undefined") {
        return Buffer.from(hex, "hex").toString("base64");
      }
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return uint8ToBase64(bytes);
    }
    return value;
  }
  return "";
}
