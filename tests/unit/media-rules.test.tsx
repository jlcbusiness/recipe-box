import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MEDIA_QUOTA_BYTES,
  FULL_IMAGE_MAX_EDGE,
  inspectImageBuffer,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_RECIPE_PHOTOS,
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
