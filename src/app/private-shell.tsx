import type { ReactNode } from 'react';
import { signOut } from './actions/auth';

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
        <details className="account-menu">
          <summary aria-label={`Account options for ${email}`} className="account-menu-trigger">
            <span className="account-menu-email">{email}</span>
            <span aria-hidden="true" className="account-avatar">
              {initials}
            </span>
          </summary>
          <div className="account-menu-panel">
            <p>{email}</p>
            <form action={signOut}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </details>
      </nav>
      <div className={`private-content${wideContent ? ' private-content-wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}
