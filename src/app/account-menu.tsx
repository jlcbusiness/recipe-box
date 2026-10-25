'use client';

import { ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { clearPrivateOfflineCaches } from '../lib/offline/cache-client';
import { signOut } from './actions/auth';

export function AccountMenu({
  email,
  initials,
  avatarUrl,
  isAdmin = false,
  adminCurrent = false,
}: {
  email: string;
  initials: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
  adminCurrent?: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError('');
    try {
      await clearPrivateOfflineCaches();
    } catch {
      setError('Private offline recipes could not be cleared. You are still signed in. Try again.');
      setPending(false);
      return;
    }

    await signOut();
  }

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        menuRef.current?.removeAttribute('open');
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  return (
    <details className="account-menu" ref={menuRef}>
      <summary aria-label={`Account options for ${email}`} className="account-menu-trigger">
        <span className="account-menu-email">{email.split('@')[0] ?? email}</span>
        <span aria-hidden="true" className="account-avatar">
          {avatarUrl ? (
            <Image
              alt=""
              className="account-avatar-image"
              height={32}
              referrerPolicy="no-referrer"
              src={avatarUrl}
              unoptimized
              width={32}
            />
          ) : (
            initials
          )}
        </span>
      </summary>
      <div className="account-menu-panel">
        <p>{email}</p>
        {isAdmin && (
          <a
            aria-current={adminCurrent ? 'page' : undefined}
            className="account-menu-admin-link"
            href="/admin"
          >
            <ShieldCheck aria-hidden="true" size={17} />
            Administration
          </a>
        )}
        <form onSubmit={handleSignOut}>
          {error && (
            <p className="account-menu-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={pending} type="submit">
            {pending ? 'Clearing offline copies...' : 'Sign out'}
          </button>
        </form>
      </div>
    </details>
  );
}
