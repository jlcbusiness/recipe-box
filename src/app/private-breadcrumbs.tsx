import Link from 'next/link';
import type { PublicationType } from '../lib/recipes/data';

export type PrivateBreadcrumbParent = {
  href: string;
  label: string;
  publicationType?: PublicationType;
};

export function PrivateBreadcrumbs({
  parents,
  currentPage,
  className,
}: {
  parents: PrivateBreadcrumbParent[];
  currentPage?: string;
  className?: string;
}) {
  if (parents.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`private-breadcrumbs ${className ?? ''}`.trim()}>
      <ol>
        {parents.map(({ href, label, publicationType }, index) => (
          <li key={href}>
            {index > 0 && (
              <span aria-hidden="true" className="private-breadcrumb-separator">
                &gt;
              </span>
            )}
            <Link
              className={
                publicationType
                  ? `private-breadcrumb-publication-link publication-type-theme-${publicationType}`
                  : undefined
              }
              href={href}
            >
              {label}
            </Link>
          </li>
        ))}
        {currentPage !== undefined && (
          <li>
            <span aria-hidden="true" className="private-breadcrumb-separator">
              &gt;
            </span>
            <span aria-current="page">{currentPage}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
