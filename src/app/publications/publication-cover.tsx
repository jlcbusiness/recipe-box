import { Globe } from 'lucide-react';
import Image from 'next/image';
import type { PublicationOption } from '../../lib/recipes/data';

export function PublicationCover({
  publication,
  imageUrl,
}: {
  publication: PublicationOption;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <span
        className={`publication-cover publication-cover-image ${publication.publication_type === 'site' ? 'publication-cover-site' : ''}`}
      >
        <Image
          alt={publication.name}
          className="publication-cover-image-content"
          height={96}
          src={imageUrl}
          unoptimized
          width={72}
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
