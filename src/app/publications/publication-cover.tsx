import { Globe } from 'lucide-react';
import type { PublicationOption } from '../../lib/recipes/data';

export function PublicationCover({ publication }: { publication: PublicationOption }) {
  if (publication.publication_type === 'site') {
    return (
      <span aria-hidden="true" className="publication-cover publication-cover-site">
        <Globe size={18} strokeWidth={1.75} />
      </span>
    );
  }

  const titleSize = publication.name.length > 48 ? 8 : publication.name.length > 30 ? 9 : 10;

  return (
    <span
      aria-hidden="true"
      className={`publication-cover ${publication.publication_type === 'book' ? 'publication-cover-book' : 'publication-cover-magazine'}`}
    >
      <span className="publication-cover-title" style={{ fontSize: `${titleSize}px` }}>
        {publication.name}
      </span>
      {publication.publication_type === 'magazine' && publication.issue && (
        <span className="publication-cover-issue">{publication.issue}</span>
      )}
    </span>
  );
}
