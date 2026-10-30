import heicConvert from 'heic-convert';
import sharp from 'sharp';
import {
  type CropRect,
  FULL_IMAGE_MAX_EDGE,
  isValidNormalizedCrop,
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

    const oriented = await sharp(input, inputOptions).rotate().toBuffer();
    return await createVariants(oriented, inputOptions);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }
    throw new ImageProcessingError('invalid_image', 'The selected file could not be decoded.');
  }
}

export async function cropImage(source: Buffer, crop: CropRect): Promise<NormalizedImage> {
  if (!isValidNormalizedCrop(crop)) {
    throw new ImageProcessingError('invalid_image', 'The saved image framing is invalid.');
  }

  try {
    const inputOptions = {
      failOn: 'error' as const,
      limitInputPixels: MAX_IMAGE_PIXELS,
    };
    const metadata = await sharp(source, inputOptions).metadata();
    if (!metadata.width || !metadata.height || metadata.format !== 'webp') {
      throw new ImageProcessingError('invalid_image', 'The source image could not be decoded.');
    }

    const rotated =
      crop.rotation === 0
        ? sharp(source, inputOptions)
        : sharp(source, inputOptions).rotate(crop.rotation);
    const rotatedWidth =
      crop.rotation === 90 || crop.rotation === 270 ? metadata.height : metadata.width;
    const rotatedHeight =
      crop.rotation === 90 || crop.rotation === 270 ? metadata.width : metadata.height;
    const left = Math.min(rotatedWidth - 1, Math.floor(crop.left * rotatedWidth));
    const top = Math.min(rotatedHeight - 1, Math.floor(crop.top * rotatedHeight));
    const width = Math.max(
      1,
      Math.min(rotatedWidth - left, Math.ceil((crop.left + crop.width) * rotatedWidth) - left),
    );
    const height = Math.max(
      1,
      Math.min(rotatedHeight - top, Math.ceil((crop.top + crop.height) * rotatedHeight) - top),
    );
    const cropped = await rotated.extract({ left, top, width, height }).toBuffer();

    return await createVariants(cropped, inputOptions);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }
    throw new ImageProcessingError(
      'invalid_image',
      'The saved image framing could not be applied.',
    );
  }
}

async function createVariants(
  input: Buffer,
  inputOptions: { failOn: 'error'; limitInputPixels: number },
): Promise<NormalizedImage> {
  const fullOutput = await sharp(input, inputOptions)
    .resize(FULL_IMAGE_MAX_EDGE, FULL_IMAGE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumbnailOutput = await sharp(input, inputOptions)
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
}
