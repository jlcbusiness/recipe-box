'use client';

import { ChevronRight, Download, Upload } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ExportAction } from '../export-action';
import { ImportAction } from '../settings/database-import-action';
import { RecipeJsonImportAction } from './recipe-json-import-action';

type JsonAsset = 'template' | 'schema' | 'strict-schema';

function localMinuteTimestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

function assetFilename(asset: JsonAsset) {
  const timestamp = localMinuteTimestamp();
  if (asset === 'template') return `recipe-template-${timestamp}.jsonc`;
  if (asset === 'strict-schema') return `recipe-schema-strict-${timestamp}.json`;
  return `recipe-schema-${timestamp}.json`;
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

export function PublicationTransferMenu({ publicationId }: { publicationId: string }) {
  const menuId = useId();
  const jsonMenuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const jsonMenuRef = useRef<HTMLDivElement>(null);
  const jsonSubmenuTriggerRef = useRef<HTMLButtonElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const jsonImportTriggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isJsonSubmenuOpen, setIsJsonSubmenuOpen] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>(':scope > [role="menuitem"]')?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isJsonSubmenuOpen) return;
    jsonMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [isJsonSubmenuOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
        setIsJsonSubmenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen]);

  function closeMenus(returnFocus = false) {
    setIsOpen(false);
    setIsJsonSubmenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function activateAction(action: 'export' | 'import' | 'json-import') {
    closeMenus(true);
    if (action === 'export') exportTriggerRef.current?.click();
    else if (action === 'import') importTriggerRef.current?.click();
    else jsonImportTriggerRef.current?.click();
  }

  async function downloadAsset(asset: JsonAsset) {
    closeMenus(true);
    setDownloadStatus('Preparing download...');
    setDownloadError(false);
    const filename = assetFilename(asset);
    try {
      const response = await fetch(`/api/recipe-json?asset=${asset}`);
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to download this JSON file.'));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setDownloadStatus(`${filename} downloaded.`);
    } catch (error) {
      setDownloadError(true);
      setDownloadStatus(
        error instanceof Error ? error.message : 'Unable to download this JSON file.',
      );
    }
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>, items: HTMLButtonElement[]) {
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : event.key === 'ArrowUp'
              ? (currentIndex - 1 + items.length) % items.length
              : -1;
    if (nextIndex >= 0 && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      closeMenus();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenus(true);
      return;
    }
    if (event.key === 'ArrowRight' && event.target === jsonSubmenuTriggerRef.current) {
      event.preventDefault();
      setIsJsonSubmenuOpen(true);
      return;
    }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        ':scope > [role="menuitem"], :scope > .publication-transfer-json-submenu > [role="menuitem"]',
      ) ?? [],
    );
    moveFocus(event, items);
  }

  function handleJsonSubmenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Tab') {
      closeMenus();
      return;
    }
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setIsJsonSubmenuOpen(false);
      jsonSubmenuTriggerRef.current?.focus();
      return;
    }
    const items = Array.from(
      jsonMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    moveFocus(event, items);
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
          onClick={() => {
            setIsOpen((open) => !open);
            setIsJsonSubmenuOpen(false);
          }}
          ref={triggerRef}
          title="Import or export"
          type="button"
        >
          <span aria-hidden="true" className="export-action-icon" />
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
            <div className="publication-transfer-json-submenu">
              <button
                aria-controls={isJsonSubmenuOpen ? jsonMenuId : undefined}
                aria-expanded={isJsonSubmenuOpen}
                aria-haspopup="menu"
                className="publication-transfer-json-submenu-trigger"
                data-submenu-toggle
                onClick={() => setIsJsonSubmenuOpen((open) => !open)}
                ref={jsonSubmenuTriggerRef}
                role="menuitem"
                type="button"
              >
                <Download aria-hidden="true" size={16} />
                <span>Import JSON</span>
                <ChevronRight aria-hidden="true" size={16} />
              </button>
              {isJsonSubmenuOpen && (
                <div
                  aria-label="Import JSON actions"
                  className="publication-transfer-menu-panel publication-transfer-json-submenu-panel"
                  id={jsonMenuId}
                  onKeyDown={handleJsonSubmenuKeyDown}
                  ref={jsonMenuRef}
                  role="menu"
                >
                  <button
                    onClick={() => activateAction('json-import')}
                    role="menuitem"
                    type="button"
                  >
                    <Upload aria-hidden="true" size={16} />
                    Import JSON file
                  </button>
                  <button
                    onClick={() => void downloadAsset('template')}
                    role="menuitem"
                    type="button"
                  >
                    Download JSON template
                  </button>
                  <button
                    onClick={() => void downloadAsset('schema')}
                    role="menuitem"
                    type="button"
                  >
                    Download JSON schema
                  </button>
                  <button
                    onClick={() => void downloadAsset('strict-schema')}
                    role="menuitem"
                    type="button"
                  >
                    Download strict schema
                  </button>
                </div>
              )}
            </div>
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
      <RecipeJsonImportAction
        publicationId={publicationId}
        returnFocusRef={triggerRef}
        triggerClassName="publication-transfer-hidden-trigger"
        triggerHidden
        triggerRef={jsonImportTriggerRef}
      />
      {downloadStatus && (
        <p
          aria-live="polite"
          className={`database-import-feedback${downloadError ? ' database-import-error' : ''}`}
          role={downloadError ? 'alert' : 'status'}
        >
          {downloadStatus}
        </p>
      )}
    </div>
  );
}
