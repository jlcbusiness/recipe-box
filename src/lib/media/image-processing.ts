import heicConvert from 'heic-convert';
import sharp from 'sharp';
import {
  FULL_IMAGE_MAX_EDGE,
  MAX_IMAGE_PIXELS,
  type SourceImageFormat,
  THUMBNAIL_MAX_EDGE,
} from './rules';

export type ProcessedImageVariant = {
  buffer: Buffer;
  bytes: number;
  width: number;
  height: number;
};

export type NormalizedImage = {
  full: ProcessedImageVariant;
  thumbnail: ProcessedImageVariant;
};

export class ImageProcessingError extends Error {
  readonly code: 'invalid_image' | 'animated_image' | 'image_too_large';

  constructor(code: ImageProcessingError['code'], message: string) {
    super(message);
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

export async function normalizeImage(
  source: Buffer,
  sourceFormat: SourceImageFormat,
): Promise<NormalizedImage> {
  try {
    const input =
      sourceFormat === 'heif'
        ? Buffer.from(await heicConvert({ buffer: source, format: 'JPEG', quality: 1 }))
        : source;
    const inputOptions = {
      failOn: 'error' as const,
      limitInputPixels: MAX_IMAGE_PIXELS,
    };
    const metadata = await sharp(input, inputOptions).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new ImageProcessingError('invalid_image', 'The selected file is not a valid image.');
    }
    if (metadata.pages && metadata.pages > 1) {
      throw new ImageProcessingError(
        'animated_image',
        'Animated images are not supported. Choose a still image.',
      );
    }
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ImageProcessingError(
        'image_too_large',
        'This image has too many pixels to process safely.',
      );
    }

    const fullOutput = await sharp(input, inputOptions)
      .rotate()
      .resize(FULL_IMAGE_MAX_EDGE, FULL_IMAGE_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumbnailOutput = await sharp(input, inputOptions)
      .rotate()
      .resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      full: {
        buffer: fullOutput.data,
        bytes: fullOutput.data.byteLength,
        width: fullOutput.info.width,
        height: fullOutput.info.height,
      },
      thumbnail: {
        buffer: thumbnailOutput.data,
        bytes: thumbnailOutput.data.byteLength,
        width: thumbnailOutput.info.width,
        height: thumbnailOutput.info.height,
      },
    };
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }
    throw new ImageProcessingError('invalid_image', 'The selected file could not be decoded.');
  }
}
