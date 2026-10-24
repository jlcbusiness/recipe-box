export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 50_000_000;
export const ACCOUNT_MEDIA_QUOTA_BYTES = 1024 * 1024 * 1024;
export const MAX_RECIPE_PHOTOS = 12;
export const FULL_IMAGE_MAX_EDGE = 2048;
export const THUMBNAIL_MAX_EDGE = 480;

export type CropRotation = 0 | 90 | 180 | 270;

export type CropCoordinates = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CropRect = CropCoordinates & { rotation: CropRotation };

const normalizedPrecision = 1_000_000;
const fullCropTolerance = 1 / normalizedPrecision;
const validCropRotations = new Set<number>([0, 90, 180, 270]);

export function isValidNormalizedCrop(value: unknown): value is CropRect {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const crop = value as Record<string, unknown>;
  if (Object.keys(crop).length !== 5 || !validCropRotations.has(crop.rotation as number)) {
    return false;
  }
  const coordinates = [crop.left, crop.top, crop.width, crop.height];
  if (
    !coordinates.every(
      (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  ) {
    return false;
  }

  const [left, top, width, height] = coordinates as number[];
  return left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 1 && top + height <= 1;
}

export function normalizeCropRect(
  crop: CropCoordinates,
  imageWidth: number,
  imageHeight: number,
  rotation: CropRotation = 0,
): CropRect | null {
  const rotated = rotation === 90 || rotation === 270;
  const coordinateWidth = rotated ? imageHeight : imageWidth;
  const coordinateHeight = rotated ? imageWidth : imageHeight;
  const values = [crop.left, crop.top, crop.width, crop.height];
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    !validCropRotations.has(rotation) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !values.every(Number.isFinite) ||
    crop.left < 0 ||
    crop.top < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.left + crop.width > coordinateWidth + fullCropTolerance ||
    crop.top + crop.height > coordinateHeight + fullCropTolerance
  ) {
    throw new Error('Crop coordinates are invalid.');
  }

  const left = Math.min(1, Number((crop.left / coordinateWidth).toFixed(6)));
  const top = Math.min(1, Number((crop.top / coordinateHeight).toFixed(6)));
  const normalized = {
    left,
    top,
    width: Math.min(
      Number((crop.width / coordinateWidth).toFixed(6)),
      Math.floor((1 - left) * normalizedPrecision) / normalizedPrecision,
    ),
    height: Math.min(
      Number((crop.height / coordinateHeight).toFixed(6)),
      Math.floor((1 - top) * normalizedPrecision) / normalizedPrecision,
    ),
    rotation,
  };

  if (
    rotation === 0 &&
    normalized.left <= fullCropTolerance &&
    normalized.top <= fullCropTolerance &&
    normalized.width >= 1 - fullCropTolerance &&
    normalized.height >= 1 - fullCropTolerance
  ) {
    return null;
  }

  if (!isValidNormalizedCrop(normalized)) {
    throw new Error('Crop coordinates are invalid.');
  }
  return normalized;
}

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
