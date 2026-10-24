import type { CropRect } from '../../lib/media/rules';

type FramedMediaImageProps = {
  alt: string;
  className?: string;
  crop: CropRect | null;
  dataPhotoId?: string;
  height: number;
  loading?: 'eager' | 'lazy';
  src: string;
  width: number;
};

export function FramedMediaImage({
  alt,
  className,
  crop,
  dataPhotoId,
  height,
  loading = 'lazy',
  src,
  width,
}: FramedMediaImageProps) {
  const left = crop?.left ?? 0;
  const top = crop?.top ?? 0;
  const cropWidth = crop?.width ?? 1;
  const cropHeight = crop?.height ?? 1;
  const rotation = crop?.rotation ?? 0;
  const rotated = rotation === 90 || rotation === 270;
  const orientedWidth = rotated ? height : width;
  const orientedHeight = rotated ? width : height;
  const sourceTransform =
    rotation === 90
      ? `translate(${height} 0) rotate(90)`
      : rotation === 180
        ? `translate(${width} ${height}) rotate(180)`
        : rotation === 270
          ? `translate(0 ${width}) rotate(270)`
          : undefined;

  return (
    <svg
      aria-hidden={alt.length === 0 || undefined}
      aria-label={alt || undefined}
      className={`framed-media-image${className ? ` ${className}` : ''}`}
      data-photo-id={dataPhotoId}
      height={cropHeight * orientedHeight}
      preserveAspectRatio="xMidYMid meet"
      role={alt ? 'img' : undefined}
      viewBox={`${left * orientedWidth} ${top * orientedHeight} ${cropWidth * orientedWidth} ${cropHeight * orientedHeight}`}
      width={cropWidth * orientedWidth}
      xmlns="http://www.w3.org/2000/svg"
    >
      <image
        href={src}
        height={height}
        preserveAspectRatio="none"
        transform={sourceTransform}
        width={width}
        x="0"
        y="0"
        {...{ loading }}
      />
    </svg>
  );
}
