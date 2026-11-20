import Link from 'next/link';

export type PrivateBreadcrumbParent = {
  href: string;
  label: string;
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
        {parents.map(({ href, label }, index) => (
          <li key={href}>
            {index > 0 && (
              <span aria-hidden="true" className="private-breadcrumb-separator">
                &gt;
              </span>
            )}
            <Link href={href}>{label}</Link>
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
