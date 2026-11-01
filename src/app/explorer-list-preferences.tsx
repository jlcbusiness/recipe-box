'use client';

import { Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  defaultExplorerDisplayPreferences,
  type ExplorerColumnDefinition,
  type ExplorerDisplayPreferences,
  type ExplorerState,
  type ExplorerStateContext,
  explorerColumnDefinitions,
} from '../lib/explorer-state';
import { saveExplorerState } from './actions/explorer-state';

type ColumnContext = 'recipes-find' | 'publications' | 'publication-recipes';

const ExplorerVisibleColumnsContext = createContext<readonly string[]>([]);

export function useExplorerVisibleColumns() {
  return useContext(ExplorerVisibleColumnsContext);
}

type ActiveColumnDrag = {
  column: string;
  pointerId: number;
  startX: number;
  startWidth: number;
  initialPreferences: ExplorerDisplayPreferences;
};

function contextColumns(context: ExplorerStateContext) {
  const key: ColumnContext =
    context === 'publications'
      ? 'publications'
      : context === 'recipes-find'
        ? 'recipes-find'
        : 'publication-recipes';
  return explorerColumnDefinitions[key];
}

function columnMaxWidth(column: ExplorerColumnDefinition) {
  if (column.key === 'name') return column.maxWidth;
  const maxWidths: Record<string, number> = {
    created_at: 180,
    recipe_count: 120,
    recipe_url: 240,
    serves: 120,
    state: 180,
    total_time_minutes: 160,
    updated_at: 180,
  };
  return Math.min(column.maxWidth, maxWidths[column.key] ?? 320);
}

function updateColumnWidth(
  drag: ActiveColumnDrag,
  clientX: number,
  definitions: ExplorerColumnDefinition[],
) {
  const definition = definitions.find(({ key }) => key === drag.column);
  if (!definition) return drag.initialPreferences;

  const width = Math.min(
    definition.maxWidth,
    Math.max(definition.minWidth, Math.round(drag.startWidth + clientX - drag.startX)),
  );
  const columnWidths = { ...drag.initialPreferences.column_widths };
  if (width === drag.startWidth && columnWidths[drag.column] === undefined) {
    delete columnWidths[drag.column];
  } else {
    columnWidths[drag.column] = width;
  }
  return { ...drag.initialPreferences, column_widths: columnWidths };
}

export function ExplorerColumnResizeHandle({ column }: { column: string }) {
  return (
    <span
      aria-hidden="true"
      className="explorer-column-resize-handle"
      data-explorer-resize-column={column}
      title={`Drag to resize ${column.replaceAll('_', ' ')} column`}
    />
  );
}

export function ExplorerListPreferences({
  autoSelectColumns = [],
  autoSelectRequestKey = null,
  context,
  consumeAutoSelectRequest = false,
  state,
  initialPreferences,
  toolbar,
  toolbarTrailing,
  toolbarAction,
  columnDefinitions,
  showControl = true,
  children,
}: {
  autoSelectColumns?: string[];
  autoSelectRequestKey?: string | null;
  context: ExplorerStateContext;
  consumeAutoSelectRequest?: boolean;
  state: ExplorerState;
  initialPreferences?: ExplorerDisplayPreferences;
  toolbar?: ReactNode;
  toolbarTrailing?: ReactNode;
  toolbarAction?: ReactNode;
  columnDefinitions?: ExplorerColumnDefinition[];
  showControl?: boolean;
  children: ReactNode;
}) {
  const definitions = (columnDefinitions ?? contextColumns(context)).map((column) => ({
    ...column,
    maxWidth: columnMaxWidth(column),
  }));
  const widthBoundsByColumn = new Map(
    definitions.map(({ key, minWidth, maxWidth }) => [key, { minWidth, maxWidth }]),
  );
  const router = useRouter();
  const defaultPreferences = defaultExplorerDisplayPreferences(context, definitions);
  const [preferences, setPreferences] = useState(() => initialPreferences ?? defaultPreferences);
  const [isOpen, setIsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLFieldSetElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<ActiveColumnDrag | null>(null);
  const stateRef = useRef(state);
  const preferencesRef = useRef(preferences);
  const saveQueueRef = useRef(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const autoSelectRequestHandledRef = useRef<string | null>(null);
  stateRef.current = state;
  preferencesRef.current = preferences;

  useEffect(() => {
    if (!isOpen) return;
    function positionPopover() {
      if (window.innerWidth <= 640) return;
      const trigger = triggerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const popoverBounds = popover.getBoundingClientRect();
      if (popoverBounds.left < 8 || popoverBounds.right > window.innerWidth - 8) {
        const parentBounds = popover.parentElement?.getBoundingClientRect();
        if (parentBounds) {
          const left = Math.max(
            8,
            Math.min(trigger.left, window.innerWidth - popoverBounds.width - 8),
          );
          popover.style.left = `${left - parentBounds.left}px`;
          popover.style.right = 'auto';
        }
      } else {
        popover.style.left = '';
        popover.style.right = '';
      }
      const maxHeight = Math.min(window.innerHeight * 0.7, 420);
      const spaceBelow = window.innerHeight - trigger.bottom - 8;
      const spaceAbove = trigger.top - 8;
      const opensAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;
      const availableSpace = opensAbove ? spaceAbove : spaceBelow;
      popover.classList.toggle('opens-above', opensAbove);
      popover.style.maxHeight = `${Math.max(0, Math.min(maxHeight, availableSpace))}px`;
    }

    positionPopover();
    window.addEventListener('resize', positionPopover);
    function closeOnOutsidePointer(event: globalThis.PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (
        popoverRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return;
      }
      setIsOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', positionPopover);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const visibleColumns = new Set(preferences.visible_columns);
  const displayedDefinitions = definitions.filter(
    ({ key, required }) => required || visibleColumns.has(key),
  );
  const gridTemplate = displayedDefinitions
    .map(({ key, minWidth, maxWidth }) => {
      const width = preferences.column_widths[key];
      if (width !== undefined) {
        return `${Math.min(maxWidth, Math.max(minWidth, width))}px`;
      }
      if (key === 'score' || key === 'starred' || key === 'hearted') {
        return `${minWidth}px`;
      }
      return key === 'name'
        ? `minmax(${minWidth}px, min(45%, ${maxWidth}px))`
        : `fit-content(${maxWidth}px)`;
    })
    .join(' ');
  const widthStyles = Object.fromEntries(
    Object.entries(preferences.column_widths).map(([key, width]) => {
      const bounds = widthBoundsByColumn.get(key);
      const clampedWidth = bounds
        ? Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width))
        : width;
      return [`--explorer-column-width-${key}`, `${clampedWidth}px`];
    }),
  );
  const wrapperStyle = {
    '--explorer-list-grid-template-columns': gridTemplate,
    ...widthStyles,
  } as CSSProperties;
  const visibleColumnAttribute = displayedDefinitions.map(({ key }) => key).join(' ');
  const displayedColumnKeys = displayedDefinitions.map(({ key }) => key);

  const updatePreferences = useCallback((next: ExplorerDisplayPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
  }, []);

  const persistPreferences = useCallback(
    (next: ExplorerDisplayPreferences, refreshRoute = false, onSuccess?: () => void) => {
      const sequence = ++saveSequenceRef.current;
      setSaveError(null);
      const save = async () => {
        try {
          const result = await saveExplorerState(context, {
            ...stateRef.current,
            schema_version: 2,
            display_preferences: next,
          });
          if (saveSequenceRef.current === sequence) {
            setSaveError(result.error ?? null);
            if (!result.error) {
              if (refreshRoute) router.refresh();
              onSuccess?.();
            }
          }
        } catch {
          if (saveSequenceRef.current === sequence) {
            setSaveError('Explorer display preferences could not be saved.');
          }
        }
      };
      saveQueueRef.current = saveQueueRef.current.then(save, save);
    },
    [context, router],
  );

  useEffect(() => {
    if (!consumeAutoSelectRequest) {
      autoSelectRequestHandledRef.current = null;
      return;
    }
    const requestKey = autoSelectRequestKey ?? JSON.stringify(autoSelectColumns);
    if (autoSelectRequestHandledRef.current === requestKey) return;
    autoSelectRequestHandledRef.current = requestKey;

    const clearRequest = () => {
      const url = new URL(window.location.href);
      if (
        autoSelectRequestKey !== null &&
        JSON.stringify(url.searchParams.getAll('filter')) !== autoSelectRequestKey
      ) {
        return;
      }
      url.searchParams.delete('auto_select_columns');
      url.searchParams.delete('no_auto_select_columns');
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    };
    const additions = autoSelectColumns.filter(
      (column) => !preferencesRef.current.visible_columns.includes(column),
    );
    if (additions.length === 0) {
      clearRequest();
      return;
    }

    const next = {
      ...preferencesRef.current,
      visible_columns: [...preferencesRef.current.visible_columns, ...additions],
    };
    updatePreferences(next);
    persistPreferences(next, false, clearRequest);
  }, [
    autoSelectColumns,
    autoSelectRequestKey,
    consumeAutoSelectRequest,
    persistPreferences,
    router,
    updatePreferences,
  ]);

  function changeVisibility(column: string, checked: boolean) {
    const next = {
      ...preferencesRef.current,
      visible_columns: checked
        ? [...preferencesRef.current.visible_columns, column]
        : preferencesRef.current.visible_columns.filter((visible) => visible !== column),
    };
    updatePreferences(next);
    persistPreferences(next, true);
  }

  function resetPreferences() {
    const next = defaultPreferences;
    updatePreferences(next);
    persistPreferences(next, true);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as Element;
    const handle = target.closest<HTMLElement>('[data-explorer-resize-column]');
    const column = handle?.dataset.explorerResizeColumn;
    const header = handle?.closest('th');
    const definition = definitions.find((item) => item.key === column);
    if (!column || !header || !definition) return;

    event.preventDefault();
    event.stopPropagation();
    const savedWidth = preferencesRef.current.column_widths[column];
    const rowPadding =
      Number.parseFloat(getComputedStyle(header.parentElement ?? header).paddingLeft) || 0;
    dragRef.current = {
      column,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth:
        savedWidth !== undefined
          ? Math.min(definition.maxWidth, Math.max(definition.minWidth, savedWidth))
          : Math.round(header.getBoundingClientRect().width + rowPadding),
      initialPreferences: preferencesRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updatePreferences(updateColumnWidth(drag, event.clientX, definitions));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const next = updateColumnWidth(drag, event.clientX, definitions);
    dragRef.current = null;
    updatePreferences(next);
    if (next.column_widths[drag.column] !== drag.initialPreferences.column_widths[drag.column]) {
      persistPreferences(next);
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    updatePreferences(drag.initialPreferences);
  }

  const controls = showControl ? (
    <div className="explorer-list-preferences-controls">
      <button
        aria-controls="explorer-list-column-options"
        aria-expanded={isOpen}
        aria-label="Choose List columns"
        className="explorer-list-preferences-trigger"
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        title="Choose List columns"
        type="button"
      >
        <Settings2 aria-hidden="true" size={18} />
      </button>
      {isOpen && (
        <fieldset
          aria-label="List columns"
          className="explorer-list-preferences-popover"
          id="explorer-list-column-options"
          ref={popoverRef}
        >
          <legend>List columns</legend>
          <button
            className="explorer-list-preferences-reset"
            onClick={resetPreferences}
            type="button"
          >
            Reset columns
          </button>
          {definitions.map(({ key, label, required }) =>
            required ? (
              <label
                className="explorer-list-preferences-option explorer-list-preferences-required"
                key={key}
              >
                <input checked disabled type="checkbox" />
                {label}
                <span>Always shown</span>
              </label>
            ) : (
              <label className="explorer-list-preferences-option" key={key}>
                <input
                  checked={visibleColumns.has(key)}
                  onChange={(event) => changeVisibility(key, event.currentTarget.checked)}
                  type="checkbox"
                />
                {label}
              </label>
            ),
          )}
        </fieldset>
      )}
    </div>
  ) : null;

  return (
    <ExplorerVisibleColumnsContext.Provider value={displayedColumnKeys}>
      <div
        className="explorer-list-preferences"
        data-visible-columns={visibleColumnAttribute}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={rootRef}
        style={wrapperStyle}
      >
        {toolbar ? (
          <div className="explorer-list-preferences-toolbar">
            <div className="explorer-list-preferences-toolbar-content">{toolbar}</div>
            {controls}
            {toolbarTrailing}
            {toolbarAction}
          </div>
        ) : (
          controls
        )}
        <div className="explorer-list-preferences-content" style={wrapperStyle}>
          {children}
        </div>
        {saveError && (
          <p className="explorer-list-preferences-error" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </ExplorerVisibleColumnsContext.Provider>
  );
}
