'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';

export function AlternatingRecipeGrid({ children }: { children: ReactNode }) {
  const gridRef = useRef<HTMLUListElement | null>(null);

  useLayoutEffect(() => {
    const gridElement = gridRef.current;
    if (!gridElement) return;

    let animationFrame = 0;
    const updateRows = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        let rowIndex = -1;
        let columnIndex = 0;
        let previousTop: number | null = null;

        for (const card of Array.from(gridElement.children)) {
          if (!(card instanceof HTMLLIElement)) continue;
          const top = card.getBoundingClientRect().top;
          if (previousTop === null || Math.abs(top - previousTop) > 1) {
            rowIndex += 1;
            columnIndex = 0;
            previousTop = top;
          } else {
            columnIndex += 1;
          }
          card.dataset.stripeCell = (rowIndex + columnIndex) % 2 === 0 ? 'odd' : 'even';
        }
      });
    };

    const resizeObserver = new ResizeObserver(updateRows);
    const mutationObserver = new MutationObserver(updateRows);
    resizeObserver.observe(gridElement);
    mutationObserver.observe(gridElement, { childList: true });
    updateRows();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <ul className="find-recipes-grid" ref={gridRef}>
      {children}
    </ul>
  );
}
