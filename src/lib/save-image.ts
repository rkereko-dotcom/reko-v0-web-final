import fs from "fs";
import path from "path";

const SAVE_FOLDER = path.join(process.cwd(), "generated-images");

/**
 * Save a base64 data-URL image to disk and return the file path.
 * Images are saved to the `generated-images/` folder at project root.
 */
export function saveImageToDisk(
  imageData: string,
  variationName: string,
  index: number,
): string {
  if (!fs.existsSync(SAVE_FOLDER)) {
    fs.mkdirSync(SAVE_FOLDER, { recursive: true });
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const safeName = variationName
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .slice(0, 30);
  const filename = `${timestamp}_${index}_${safeName}.png`;
  const filePath = path.join(SAVE_FOLDER, filename);

  const base64Match = imageData.match(/^data:(.+);base64,(.+)$/);
  if (base64Match) {
    const buffer = Buffer.from(base64Match[2], "base64");
    fs.writeFileSync(filePath, buffer);
    console.log(`💾 Saved: ${filename}`);
    return filePath;
  }
  return "";
}

/**
 * Save an array of generated images and return an array of saved file paths.
 */
export function saveGeneratedImages(
  images: { imageData: string; index: number; name?: string }[],
  variationNames?: string[],
): string[] {
  const savedPaths: string[] = [];
  for (const img of images) {
    const varName =
      img.name ||
      variationNames?.[img.index] ||
      `Variation ${img.index + 1}`;
    const savedPath = saveImageToDisk(img.imageData, varName, img.index);
    if (savedPath) savedPaths.push(savedPath);
  }
  if (savedPaths.length > 0) {
    console.log(
      `💾 Auto-saved ${savedPaths.length} images to: ${SAVE_FOLDER}`,
    );
  }
  return savedPaths;
}
