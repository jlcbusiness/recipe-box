import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MEDIA_QUOTA_BYTES,
  FULL_IMAGE_MAX_EDGE,
  inspectImageBuffer,
  isValidNormalizedCrop,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_RECIPE_PHOTOS,
  normalizeCropRect,
  THUMBNAIL_MAX_EDGE,
} from '../../src/lib/media/rules';

function heifBuffer(brand: string): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(16, 0);
  buffer.write('ftyp', 4);
  buffer.write(brand, 8);
  return buffer;
}

describe('media rules', () => {
  it('sets the agreed source, account, count, and derivative limits', () => {
    expect(MAX_IMAGE_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(ACCOUNT_MEDIA_QUOTA_BYTES).toBe(1024 * 1024 * 1024);
    expect(MAX_RECIPE_PHOTOS).toBe(12);
    expect(FULL_IMAGE_MAX_EDGE).toBe(2048);
    expect(THUMBNAIL_MAX_EDGE).toBe(480);
  });

  it('normalizes pixel crop coordinates and stores a full-image crop as null', () => {
    expect(normalizeCropRect({ left: 100, top: 50, width: 400, height: 300 }, 1000, 500)).toEqual({
      left: 0.1,
      top: 0.1,
      width: 0.4,
      height: 0.6,
      rotation: 0,
    });
    expect(normalizeCropRect({ left: 0, top: 0, width: 1000, height: 500 }, 1000, 500)).toBeNull();
  });

  it('normalizes pixel coordinates against the rotated image dimensions', () => {
    expect(
      normalizeCropRect({ left: 25, top: 50, width: 250, height: 500 }, 1000, 500, 90),
    ).toEqual({ left: 0.05, top: 0.05, width: 0.5, height: 0.5, rotation: 90 });
    expect(normalizeCropRect({ left: 0, top: 0, width: 500, height: 1000 }, 1000, 500, 90)).toEqual(
      {
        left: 0,
        top: 0,
        width: 1,
        height: 1,
        rotation: 90,
      },
    );
  });

  it.each([
    [{ left: -1, top: 0, width: 10, height: 10 }, 100, 100],
    [{ left: 90, top: 0, width: 11, height: 10 }, 100, 100],
    [{ left: 0, top: 0, width: 0, height: 10 }, 100, 100],
    [{ left: 0, top: 0, width: 10, height: 10 }, 0, 100],
  ])('rejects invalid pixel crop coordinates %s', (coordinates, imageWidth, imageHeight) => {
    expect(() => normalizeCropRect(coordinates, imageWidth, imageHeight)).toThrow(
      'Crop coordinates are invalid.',
    );
  });

  it.each([
    { left: 0, top: 0, width: 0.25, height: 0.25, rotation: 0 },
    { left: 0.75, top: 0.75, width: 0.25, height: 0.25, rotation: 0 },
    { left: 0, top: 0, width: 0.25, height: 0.25, rotation: 90 },
  ])('accepts bounded normalized crop coordinates %s', (crop) => {
    expect(isValidNormalizedCrop(crop)).toBe(true);
  });

  it.each([
    { left: -0.01, top: 0, width: 0.5, height: 0.5 },
    { left: 0.8, top: 0, width: 0.3, height: 0.5 },
    { left: 0.0000005, top: 0, width: 1, height: 0.5 },
    { left: 0, top: 0, width: 0, height: 0.5 },
    { left: Number.NaN, top: 0, width: 0.5, height: 0.5 },
    { left: 0, top: 0, width: 0.5 },
    { left: 0, top: 0, width: 0.5, height: 0.5 },
    { left: 0, top: 0, width: 0.5, height: 0.5, rotation: 45 },
    { left: 0, top: 0, width: 0.5, height: 0.5, extra: true },
  ])('rejects malformed normalized crop coordinates %s', (crop) => {
    expect(isValidNormalizedCrop(crop)).toBe(false);
  });

  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
    [Buffer.from('RIFF0000WEBP', 'ascii'), 'webp'],
    [heifBuffer('heic'), 'heif'],
    [heifBuffer('heix'), 'heif'],
    [heifBuffer('mif1'), 'heif'],
  ] as const)('recognizes %s from its content signature', (buffer, format) => {
    expect(inspectImageBuffer(buffer)).toEqual({ ok: true, format });
  });

  it.each([
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8'),
    Buffer.from('not an image'),
  ])('rejects unsupported content %s', (buffer) => {
    expect(inspectImageBuffer(buffer)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('rejects an oversized source before attempting image decoding', () => {
    expect(inspectImageBuffer(Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});
