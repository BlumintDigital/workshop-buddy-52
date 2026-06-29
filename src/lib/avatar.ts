// Avatar upload constraints and client-side resizing.
// Keeps files small (square JPEG) so RLS/DB and storage stay consistent.

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB pre-resize cap
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const AVATAR_OUTPUT_SIZE = 512; // square px
export const AVATAR_OUTPUT_TYPE = "image/jpeg";
export const AVATAR_OUTPUT_QUALITY = 0.9;
export const AVATAR_OUTPUT_EXT = "jpg";

export type AvatarValidationError = { message: string };

export function validateAvatarFile(file: File): AvatarValidationError | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return { message: "Unsupported file type. Use JPG, PNG, WEBP, or GIF." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    const mb = (AVATAR_MAX_BYTES / 1024 / 1024).toFixed(0);
    return { message: `Image is too large. Max ${mb} MB.` };
  }
  return null;
}

/** Load a File into an HTMLImageElement. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image file")); };
    img.src = url;
  });
}

/**
 * Resize and crop to a centered square JPEG (AVATAR_OUTPUT_SIZE).
 * Returns a Blob suitable for upload.
 */
export async function processAvatarFile(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const size = AVATAR_OUTPUT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser");

  // Center-crop source to a square, then draw scaled.
  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, AVATAR_OUTPUT_TYPE, AVATAR_OUTPUT_QUALITY)
  );
  if (!blob) throw new Error("Failed to process image");
  return blob;
}
