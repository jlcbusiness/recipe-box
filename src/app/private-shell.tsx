import { Archive, LibraryBig, Settings, Trash2 } from 'lucide-react';
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
  const mainNavigation = navigation.filter(({ href }) => href !== '/settings');
  const settingsNavigation = navigation.find(({ href }) => href === '/settings');

  return (
    <div className="private-shell">
      <nav aria-label="Main navigation" className="private-nav">
        <div className="private-nav-links">
          {mainNavigation.map(({ href, label, current }) => (
            <a
              aria-label={label}
              aria-current={current ? 'page' : undefined}
              href={href}
              key={href}
            >
              {href === '/recipes' && (
                <Archive aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              {href === '/publications' && (
                <LibraryBig aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              <span className="private-nav-link-label">{label}</span>
            </a>
          ))}
        </div>
        <div className="private-nav-bottom">
          <a
            aria-label="Trash"
            className="private-nav-utility-link"
            href="/recipes/trash"
            title="Trash"
          >
            <Trash2 aria-hidden="true" size={17} strokeWidth={1.8} />
            <span className="private-nav-utility-label">Trash</span>
          </a>
          {settingsNavigation && (
            <a
              aria-label={settingsNavigation.label}
              aria-current={settingsNavigation.current ? 'page' : undefined}
              className="private-nav-utility-link"
              href={settingsNavigation.href}
              title={settingsNavigation.label}
            >
              <Settings aria-hidden="true" size={17} strokeWidth={1.8} />
              <span className="private-nav-utility-label">{settingsNavigation.label}</span>
            </a>
          )}
          <AccountMenu email={email} initials={initials} />
        </div>
      </nav>
      <div className={`private-content${wideContent ? ' private-content-wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}
