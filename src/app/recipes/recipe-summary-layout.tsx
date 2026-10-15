import type { ReactNode } from 'react';

export function RecipeSummaryLayout({
  children,
  hasPhotos,
}: {
  children: ReactNode;
  hasPhotos: boolean;
}) {
  return (
    <div
      className={`recipe-summary-layout${hasPhotos ? ' recipe-summary-layout-with-photos' : ''}`}
    >
      {children}
    </div>
  );
}
