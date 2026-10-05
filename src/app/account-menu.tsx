'use client';

import { useEffect, useRef } from 'react';
import { signOut } from './actions/auth';

export function AccountMenu({ email, initials }: { email: string; initials: string }) {
  const menuRef = useRef<HTMLDetailsElement>(null);

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
  );
}
