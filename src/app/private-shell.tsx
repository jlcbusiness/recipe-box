import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { AccountMenu } from './account-menu';

export type PrivateNavItem = {
  href: string;
  label: string;
  current?: boolean;
};

export function PrivateShell({
  children,
  email,
  navigation,
  wideContent = false,
}: {
  children: ReactNode;
  email: string;
  navigation: PrivateNavItem[];
  wideContent?: boolean;
}) {
  const emailName = email.split('@')[0] ?? email;
  const nameParts = emailName.split(/[._-]+/).filter(Boolean);
  const initials =
    nameParts.length > 1
      ? nameParts
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()
      : (nameParts[0]?.slice(0, 2).toUpperCase() ?? '?');

  return (
    <div className="private-shell">
      <nav aria-label="Main navigation" className="private-nav">
        <div className="private-nav-links">
          {navigation.map(({ href, label, current }) => (
            <a aria-current={current ? 'page' : undefined} href={href} key={href}>
              {label}
            </a>
          ))}
        </div>
        <div className="private-nav-bottom">
          <a className="private-nav-utility-link" href="/recipes/trash" title="Trash">
            <Trash2 aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>Trash</span>
          </a>
          <AccountMenu email={email} initials={initials} />
        </div>
      </nav>
      <div className={`private-content${wideContent ? ' private-content-wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}
