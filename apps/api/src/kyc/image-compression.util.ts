import sharp from 'sharp';

const MAX_COMPRESSED_BYTES = 800 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/jpg']);

export function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has(mime.toLowerCase());
}

export async function compressImage(buffer: Buffer): Promise<Buffer> {
  if (buffer.length <= MAX_COMPRESSED_BYTES) {
    return buffer;
  }

  let quality = 85;
  let output = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer();

  while (output.length > MAX_COMPRESSED_BYTES && quality > 30) {
    quality -= 10;
    output = await sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (output.length > MAX_COMPRESSED_BYTES) {
    output = await sharp(buffer)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  }

  return output;
}