'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export function RecipeListScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const updateOverflow = () => {
      setHasOverflow(scrollElement.scrollWidth > scrollElement.clientWidth + 1);
    };

    updateOverflow();

    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(scrollElement);
    const table = scrollElement.querySelector('table');
    if (table) resizeObserver.observe(table);

    const mutationObserver = new MutationObserver(updateOverflow);
    mutationObserver.observe(scrollElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    const preferencesContent = scrollElement.closest('.explorer-list-preferences-content');
    if (preferencesContent) {
      mutationObserver.observe(preferencesContent, {
        attributeFilter: ['style'],
        attributes: true,
      });
    }

    window.addEventListener('resize', updateOverflow);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, []);

  return (
    <div className="recipe-list-scroll-region">
      {hasOverflow && (
        <p className="recipe-list-scroll-hint" id={hintId}>
          More columns are offscreen. Hold Shift while scrolling, or swipe sideways, to see them.
        </p>
      )}
      <section
        aria-describedby={hasOverflow ? hintId : undefined}
        aria-label="Recipe results table"
        className={`recipe-list-scroll${className ? ` ${className}` : ''}`}
        ref={scrollRef}
        tabIndex={hasOverflow ? 0 : undefined}
      >
        {children}
      </section>
    </div>
  );
}
