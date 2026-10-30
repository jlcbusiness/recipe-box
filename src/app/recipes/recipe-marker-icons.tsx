import { Heart, Star } from 'lucide-react';

export type RecipeMarker = 'star' | 'heart';

export function RecipeMarkerIcon({ marker, size = 16 }: { marker: RecipeMarker; size?: number }) {
  const Icon = marker === 'star' ? Star : Heart;
  return <Icon aria-hidden="true" data-marker={marker} size={size} strokeWidth={1.8} />;
}

export function RecipeMarkerColumnHeader({
  label,
  marker,
}: {
  label: string;
  marker: RecipeMarker;
}) {
  return (
    <span className="recipe-marker-column-heading">
      <span className="visually-hidden">{label}</span>
      <RecipeMarkerIcon marker={marker} />
    </span>
  );
}

export function RecipeMarkerIndicators({
  starred,
  hearted,
  className = '',
}: {
  starred: boolean;
  hearted: boolean;
  className?: string;
}) {
  if (!starred && !hearted) return null;

  const activeMarkers = [
    ...(starred ? [{ marker: 'star' as const, label: 'Starred' }] : []),
    ...(hearted ? [{ marker: 'heart' as const, label: 'Hearted' }] : []),
  ];

  return (
    <span
      aria-label={activeMarkers.map(({ label }) => label).join(', ')}
      className={`recipe-marker-indicators ${className}`.trim()}
      role="img"
    >
      {activeMarkers.map(({ marker }) => (
        <RecipeMarkerIcon key={marker} marker={marker} size={16} />
      ))}
    </span>
  );
}

export function RecipeGridMarkerIndicators({
  starred,
  hearted,
  score,
}: {
  starred: boolean;
  hearted: boolean;
  score: number | null | undefined;
}) {
  const hasScore = score !== null && score !== undefined;
  if (!starred && !hearted && !hasScore) return null;

  return (
    <span className="recipe-grid-marker-indicators">
      <span className="recipe-grid-marker-content">
        <RecipeMarkerIndicators
          starred={starred}
          hearted={hearted}
          className="recipe-grid-marker-icon-stack"
        />
        {hasScore && (
          <span
            className={`recipe-grid-rating-indicator${score < 0 ? ' recipe-score-negative' : ''}`}
          >
            <span className="visually-hidden">Rating </span>
            {score}
          </span>
        )}
      </span>
    </span>
  );
}

export function RecipeMarkerStamp({ marker, label }: { marker: RecipeMarker; label: string }) {
  return (
    <span
      aria-label={label}
      className={`recipe-marker-stamp recipe-marker-stamp-${marker}`}
      role="img"
    >
      <RecipeMarkerIcon marker={marker} />
    </span>
  );
}
