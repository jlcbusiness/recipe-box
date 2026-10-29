'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_PWA !== 'true') {
      const serviceWorkerScript = `${window.location.origin}/sw.js`;
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((registration) =>
                [registration.active, registration.installing, registration.waiting].some(
                  (worker) => worker?.scriptURL === serviceWorkerScript,
                ),
              )
              .map((registration) => registration.unregister()),
          ),
        )
        .then((unregistered) => {
          if (unregistered.some((success) => !success)) {
            console.warn('The Recipe Box service worker could not be unregistered in development.');
          }
        })
        .catch((error: unknown) => {
          console.error(
            'Failed to unregister the Recipe Box service worker in development.',
            error,
          );
        });
      return;
    }

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined);
  }, []);

  return null;
}
