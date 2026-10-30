import { Globe } from 'lucide-react';
import Image from 'next/image';
import type { CropRect } from '../../lib/media/rules';
import type { PublicationOption } from '../../lib/recipes/data';
import { FramedMediaImage } from '../media/framed-media-image';

export function PublicationCover({
  publication,
  imageUrl,
  crop = null,
  imageWidth = 72,
  imageHeight = 96,
  displayWidth,
  displayHeight,
}: {
  publication: PublicationOption;
  imageUrl?: string | null;
  crop?: CropRect | null;
  imageWidth?: number;
  imageHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
}) {
  if (publication.publication_type === 'collection') {
    return (
      <span className="publication-cover publication-cover-recipe-tin">
        <Image
          alt="Recipe Tin"
          className="publication-cover-image-content"
          height={1031}
          loading="eager"
          src="/images/recipe-tin-3e1f5f0d8f3a.webp"
          width={933}
        />
      </span>
    );
  }

  if (imageUrl) {
    return (
      <span
        className={`publication-cover publication-cover-image ${publication.publication_type === 'site' ? 'publication-cover-site' : ''}`}
      >
        <FramedMediaImage
          alt={publication.name}
          className="publication-cover-image-content"
          crop={crop}
          displayHeight={displayHeight}
          displayWidth={displayWidth}
          height={imageHeight}
          src={imageUrl}
          width={imageWidth}
        />
      </span>
    );
  }

  if (publication.publication_type === 'site') {
    return (
      <span
        aria-hidden="true"
        className="publication-cover publication-cover-site publication-cover-fallback"
      >
        <Globe size={18} strokeWidth={1.75} />
      </span>
    );
  }

  const titleSize = publication.name.length > 48 ? 8 : publication.name.length > 30 ? 9 : 10;

  return (
    <span
      aria-hidden="true"
      className={`publication-cover publication-cover-fallback ${publication.publication_type === 'book' ? 'publication-cover-book' : 'publication-cover-magazine'}`}
    >
      <span className="publication-cover-title" style={{ fontSize: `${titleSize}px` }}>
        {publication.name}
      </span>
    </span>
  );
}
