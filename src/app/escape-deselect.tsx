'use client';

import { useEffect } from 'react';

export function EscapeDeselect() {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement) || !activeElement.matches(':focus-visible')) {
        return;
      }

      const isClosedPicklistCategory =
        activeElement instanceof HTMLSelectElement &&
        activeElement.getAttribute('aria-label') === 'Picklist category' &&
        !activeElement.matches(':open');
      const isClearCatalogSearch =
        activeElement instanceof HTMLInputElement &&
        activeElement.value === '' &&
        ['Search ingredients', 'Search tags'].includes(
          activeElement.getAttribute('aria-label') ?? '',
        );

      if (!isClosedPicklistCategory && !isClearCatalogSearch) return;
      activeElement.blur();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return null;
}
