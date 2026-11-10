/**
 * Image upload validation. The file name and the client-declared MIME type are
 * never trusted: the type comes from the file's own magic bytes and the stored
 * extension is derived from it. SVG (scriptable) is not accepted.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageKind = "png" | "jpg" | "gif" | "webp";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export function sniffImage(buf: Uint8Array): ImageKind | null {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

/** Throws UploadError unless the bytes are a real, reasonably sized image. */
export function validateImage(buf: Uint8Array): { ext: `.${ImageKind}` } {
  if (buf.length === 0) throw new UploadError("The image file is empty.");
  if (buf.length > MAX_IMAGE_BYTES) throw new UploadError("The image is larger than 5 MB.");
  const kind = sniffImage(buf);
  if (!kind) throw new UploadError("Only PNG, JPEG, GIF or WebP images are allowed.");
  return { ext: `.${kind}` };
}
