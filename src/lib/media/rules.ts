export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ACCOUNT_MEDIA_QUOTA_BYTES = 1024 * 1024 * 1024;
export const MAX_RECIPE_PHOTOS = 12;
export const FULL_IMAGE_MAX_EDGE = 2048;
export const THUMBNAIL_MAX_EDGE = 480;

export type SourceImageFormat = 'jpeg' | 'png' | 'webp' | 'heif';

export type ImageInspection =
  | { ok: true; format: SourceImageFormat }
  | { ok: false; reason: 'too_large' | 'unsupported' };

const heifBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

export function inspectImageBuffer(buffer: Buffer): ImageInspection {
  if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ok: true, format: 'jpeg' };
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ok: true, format: 'png' };
  }

  if (buffer.byteLength >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    if (buffer.toString('ascii', 8, 12) === 'WEBP') {
      return { ok: true, format: 'webp' };
    }
  }

  if (buffer.byteLength >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const boxLength = Math.min(buffer.readUInt32BE(0), buffer.byteLength);
    for (let offset = 8; offset + 4 <= boxLength; offset += offset === 8 ? 8 : 4) {
      if (heifBrands.has(buffer.toString('ascii', offset, offset + 4))) {
        return { ok: true, format: 'heif' };
      }
    }
  }

  return { ok: false, reason: 'unsupported' };
}
