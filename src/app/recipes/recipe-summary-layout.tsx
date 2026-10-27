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
      className={`recipe-summary-layout recipe-summary-layout-with-detail-heading${hasPhotos ? ' recipe-summary-layout-with-photos' : ''}`}
    >
      {children}
    </div>
  );
}
