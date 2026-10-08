// @vitest-environment node

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeImage } from '../../src/lib/media/image-processing';
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

  it('rejects malformed image bytes with a typed processing error', async () => {
    await expect(normalizeImage(Buffer.from('not an image'), 'jpeg')).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });
});
