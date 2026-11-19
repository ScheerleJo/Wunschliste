/**
 * Verkleinert große Fotos schon im Browser, bevor sie hochgeladen werden
 * (spart am Handy Datenvolumen und Zeit). Der Server verkleinert ohnehin nochmal.
 */
const MAX_EDGE = 2400;

export async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // z. B. HEIC, das der Browser nicht lesen kann: der Server meldet sich dann
  }
}

/** Bilder aus einem Einfüge- oder Drop-Ereignis */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return [...data.files].filter((f) => f.type.startsWith("image/"));
}
