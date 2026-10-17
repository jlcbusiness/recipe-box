'use client';

import { ArrowDownUp, Download, Upload } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ExportAction } from '../export-action';
import { ImportAction } from '../settings/database-import-action';

export function PublicationTransferMenu({ publicationId }: { publicationId: string }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  function activateAction(action: 'export' | 'import') {
    setIsOpen(false);
    triggerRef.current?.focus();
    (action === 'export' ? exportTriggerRef : importTriggerRef).current?.click();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : event.key === 'ArrowUp'
              ? (currentIndex - 1 + items.length) % items.length
              : -1;

    if (nextIndex >= 0 && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }

  return (
    <div className="publication-mobile-transfer-actions" ref={rootRef}>
      <div className="publication-transfer-menu-layer">
        <button
          aria-controls={isOpen ? menuId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label="Publication transfer options"
          className="publication-transfer-menu-trigger"
          onClick={() => setIsOpen((open) => !open)}
          ref={triggerRef}
          title="Import or export"
          type="button"
        >
          <ArrowDownUp aria-hidden="true" size={18} />
        </button>
        {isOpen && (
          <div
            aria-label="Publication transfer actions"
            className="publication-transfer-menu-panel"
            id={menuId}
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
          >
            <button onClick={() => activateAction('export')} role="menuitem" type="button">
              <Download aria-hidden="true" size={16} />
              Export publication
            </button>
            <button onClick={() => activateAction('import')} role="menuitem" type="button">
              <Upload aria-hidden="true" size={16} />
              Import recipe
            </button>
          </div>
        )}
      </div>
      <ExportAction
        ariaLabel="Export publication"
        buttonClassName="recipe-secondary-button publication-detail-export-button publication-transfer-hidden-trigger"
        buttonLabel="Export"
        className="publication-transfer-export-source"
        scope={{ type: 'publication', id: publicationId }}
        triggerHidden
        triggerRef={exportTriggerRef}
      />
      <ImportAction
        compact
        returnFocusRef={triggerRef}
        scope={{ type: 'recipe' }}
        targetPublicationId={publicationId}
        triggerClassName="publication-transfer-hidden-trigger"
        triggerHidden
        triggerLabel="Import recipe"
        triggerRef={importTriggerRef}
      />
    </div>
  );
}
