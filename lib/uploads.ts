import path from "path";
import { mkdirSync } from "fs";

// upload storage root: railway volume in prod (/data/uploads via UPLOAD_DIR),
// ./uploads locally, /tmp on the ephemeral vercel demo.
export function uploadDir(): string {
  const dir =
    process.env.UPLOAD_DIR ??
    (process.env.VERCEL
      ? "/tmp/uploads"
      : path.join(process.cwd(), "uploads"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// magic-byte sniffing — never trust the client's content-type
export function sniffImage(buf: Buffer): string | null {
  if (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "gif";
  if (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// hash-named files: [64 hex chars].[ext] — dedupes identical art and makes
// path traversal impossible to express
export const UPLOAD_NAME_RE = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;
