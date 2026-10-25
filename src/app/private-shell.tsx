'use client';

import { Archive, CircleHelp, LibraryBig, Search, Settings, Trash2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccountMenu } from './account-menu';
import { EscapeDeselect } from './escape-deselect';

export type PrivateNavItem = {
  href: string;
  label: string;
  current?: boolean;
};

function getGoogleAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      (url.hostname !== 'googleusercontent.com' && !url.hostname.endsWith('.googleusercontent.com'))
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function PrivateShell({
  children,
  email,
  avatarUrl,
  handPreference = 'right',
  navigation,
  wideContent = false,
}: {
  children: ReactNode;
  email: string;
  avatarUrl?: unknown;
  handPreference?: 'left' | 'right';
  navigation: PrivateNavItem[];
  wideContent?: boolean;
}) {
  const pathname = usePathname() ?? '';
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
  const profileImageUrl = getGoogleAvatarUrl(avatarUrl);
  const mainNavigation = navigation.filter(
    ({ href }) => href !== '/settings' && href !== '/recipes/find' && href !== '/admin',
  );
  const libraryIndex = mainNavigation.findIndex(({ href }) => href === '/publications');
  mainNavigation.splice(libraryIndex < 0 ? mainNavigation.length : libraryIndex + 1, 0, {
    href: '/recipes/find',
    label: 'Search',
  });
  mainNavigation.push({ href: '/recipes/trash', label: 'Trash' });
  const settingsNavigation = navigation.find(({ href }) => href === '/settings');
  const helpNavigation = { href: '/help', label: 'Help' };
  const adminNavigation = navigation.find(({ href }) => href === '/admin');
  const isCurrent = (href: string) => {
    if (href === '/recipes') {
      return (
        pathname === href ||
        (pathname.startsWith(`${href}/`) &&
          !pathname.startsWith('/recipes/find') &&
          !pathname.startsWith('/recipes/trash'))
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="private-shell" data-hand={handPreference}>
      <EscapeDeselect />
      <nav aria-label="Main navigation" className="private-nav">
        <div className="private-nav-links">
          {mainNavigation.map(({ href, label }) => (
            <a
              aria-label={label}
              aria-current={isCurrent(href) ? 'page' : undefined}
              href={href}
              key={href}
              title={label}
            >
              {href === '/recipes' && (
                <Archive aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              {href === '/publications' && (
                <LibraryBig aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              {href === '/recipes/find' && (
                <Search aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              {href === '/recipes/trash' && (
                <Trash2 aria-hidden="true" className="private-nav-mobile-icon" size={20} />
              )}
              <span className="private-nav-link-label">{label}</span>
            </a>
          ))}
        </div>
        <div className="private-nav-bottom">
          <a
            aria-current={isCurrent(helpNavigation.href) ? 'page' : undefined}
            aria-label={helpNavigation.label}
            className="private-nav-utility-link"
            href={helpNavigation.href}
            title={helpNavigation.label}
          >
            <CircleHelp aria-hidden="true" size={17} strokeWidth={1.8} />
            <span className="private-nav-utility-label">{helpNavigation.label}</span>
          </a>
          {settingsNavigation && (
            <a
              aria-label={settingsNavigation.label}
              aria-current={isCurrent(settingsNavigation.href) ? 'page' : undefined}
              className="private-nav-utility-link"
              href={settingsNavigation.href}
              title={settingsNavigation.label}
            >
              <Settings aria-hidden="true" size={17} strokeWidth={1.8} />
              <span className="private-nav-utility-label">{settingsNavigation.label}</span>
            </a>
          )}
          <AccountMenu
            adminCurrent={Boolean(adminNavigation && isCurrent(adminNavigation.href))}
            avatarUrl={profileImageUrl}
            email={email}
            initials={initials}
            isAdmin={Boolean(adminNavigation)}
          />
        </div>
      </nav>
      <div className={`private-content${wideContent ? ' private-content-wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}
