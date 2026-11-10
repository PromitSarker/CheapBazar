/** Validates an uploaded image by its bytes and stores it under public/uploads with a generated name. */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { validateImage } from "./uploads";

/** Returns the public path ("/uploads/<uuid>.png"). Throws UploadError for anything that is not a real image. */
export async function saveImageUpload(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { ext } = validateImage(buffer); // the type comes from the bytes, never the file name
  const filename = crypto.randomUUID() + ext;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}
