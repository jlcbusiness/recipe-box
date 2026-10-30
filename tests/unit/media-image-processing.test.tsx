// @vitest-environment node

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cropImage, normalizeImage } from '../../src/lib/media/image-processing';
import { inspectImageBuffer } from '../../src/lib/media/rules';

describe('image normalization', () => {
  it('decodes a real HEIC fixture and normalizes it to metadata-free WebP variants', async () => {
    const source = await readFile('tests/fixtures/media/still-tiny.heic');
    const inspection = inspectImageBuffer(source);

    expect(inspection).toEqual({ ok: true, format: 'heif' });
    if (!inspection.ok) {
      throw new Error('Expected the HEIC fixture to have a supported HEIF signature.');
    }

    const result = await normalizeImage(source, inspection.format);
    const full = await sharp(result.full.buffer).metadata();
    const thumbnail = await sharp(result.thumbnail.buffer).metadata();

    expect(full.format).toBe('webp');
    expect(full.width).toBe(320);
    expect(full.height).toBe(427);
    expect(full.exif).toBeUndefined();
    expect(full.iptc).toBeUndefined();
    expect(full.xmp).toBeUndefined();
    expect(thumbnail.format).toBe('webp');
    expect(thumbnail.width).toBe(320);
    expect(thumbnail.height).toBe(427);
    expect(result.full.bytes).toBe(result.full.buffer.byteLength);
    expect(result.thumbnail.bytes).toBe(result.thumbnail.buffer.byteLength);
  });

  it('normalizes orientation, strips metadata, and creates bounded WebP variants', async () => {
    const source = await sharp({
      create: {
        width: 2800,
        height: 1400,
        channels: 3,
        background: { r: 170, g: 90, b: 55 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { ImageDescription: 'private note' } } })
      .toBuffer();

    const result = await normalizeImage(source, 'jpeg');
    const full = await sharp(result.full.buffer).metadata();
    const thumbnail = await sharp(result.thumbnail.buffer).metadata();

    expect(full.format).toBe('webp');
    expect(full.width).toBeLessThanOrEqual(2048);
    expect(full.height).toBeLessThanOrEqual(2048);
    expect(full.width).toBe(1024);
    expect(full.height).toBe(2048);
    expect(full.orientation).toBeUndefined();
    expect(full.exif).toBeUndefined();
    expect(full.iptc).toBeUndefined();
    expect(full.xmp).toBeUndefined();
    expect(thumbnail.format).toBe('webp');
    expect(thumbnail.width).toBeLessThanOrEqual(480);
    expect(thumbnail.height).toBeLessThanOrEqual(480);
    expect(result.full.bytes).toBe(result.full.buffer.byteLength);
    expect(result.thumbnail.bytes).toBe(result.thumbnail.buffer.byteLength);
  });

  it('normalizes a 48-megapixel phone JPEG', async () => {
    const source = await sharp({
      create: {
        width: 8064,
        height: 6048,
        channels: 3,
        background: { r: 170, g: 90, b: 55 },
      },
    })
      .jpeg({ quality: 40 })
      .toBuffer();

    const result = await normalizeImage(source, 'jpeg');

    expect(result.full.width).toBe(2048);
    expect(result.full.height).toBe(1536);
    expect(result.thumbnail.width).toBe(480);
    expect(result.thumbnail.height).toBe(360);
  });

  it('creates display variants from normalized crop coordinates and rotation', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 170, g: 90, b: 55 },
      },
    })
      .webp()
      .toBuffer();

    const result = await cropImage(source, {
      left: 0.1,
      top: 0.2,
      width: 0.5,
      height: 0.5,
      rotation: 90,
    });

    expect(result.full.width).toBe(25);
    expect(result.full.height).toBe(50);
    expect(result.thumbnail.width).toBe(25);
    expect(result.thumbnail.height).toBe(50);
    expect((await sharp(result.full.buffer).metadata()).format).toBe('webp');
  });

  it('rejects malformed image bytes with a typed processing error', async () => {
    await expect(normalizeImage(Buffer.from('not an image'), 'jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });

  it('rejects invalid saved crop coordinates', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 170, g: 90, b: 55 },
      },
    })
      .webp()
      .toBuffer();

    await expect(
      cropImage(source, { left: 0.8, top: 0, width: 0.5, height: 0.5, rotation: 0 }),
    ).rejects.toMatchObject({ code: 'invalid_image' });
  });
});
