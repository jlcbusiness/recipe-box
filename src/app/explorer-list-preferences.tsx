'use client';

import { Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  context,
  state,
  initialPreferences,
  toolbar,
  toolbarAction,
  columnDefinitions,
  showControl = true,
  children,
}: {
  context: ExplorerStateContext;
  state: ExplorerState;
  initialPreferences?: ExplorerDisplayPreferences;
  toolbar?: ReactNode;
  toolbarAction?: ReactNode;
  columnDefinitions?: ExplorerColumnDefinition[];
  showControl?: boolean;
  children: ReactNode;
}) {
  const definitions = (columnDefinitions ?? contextColumns(context)).map((column) => ({
    ...column,
    maxWidth: columnMaxWidth(column),
  }));
  const maximumWidthByColumn = new Map(definitions.map(({ key, maxWidth }) => [key, maxWidth]));
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
  stateRef.current = state;
  preferencesRef.current = preferences;

  useEffect(() => {
    if (!isOpen) return;
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
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const visibleColumns = new Set(preferences.visible_columns);
  const displayedDefinitions = definitions.filter(
    ({ key, required }) => required || visibleColumns.has(key),
  );
  const gridTemplate = displayedDefinitions
    .map(({ key, maxWidth }) => {
      const width = preferences.column_widths[key];
      if (width !== undefined) return `${Math.min(width, maxWidth)}px`;
      return key === 'name' ? `minmax(0, min(45%, ${maxWidth}px))` : `fit-content(${maxWidth}px)`;
    })
    .join(' ');
  const widthStyles = Object.fromEntries(
    Object.entries(preferences.column_widths).map(([key, width]) => [
      `--explorer-column-width-${key}`,
      `${Math.min(width, maximumWidthByColumn.get(key) ?? width)}px`,
    ]),
  );
  const wrapperStyle = {
    '--explorer-list-grid-template-columns': gridTemplate,
    ...widthStyles,
  } as CSSProperties;
  const visibleColumnAttribute = displayedDefinitions.map(({ key }) => key).join(' ');

  function updatePreferences(next: ExplorerDisplayPreferences) {
    preferencesRef.current = next;
    setPreferences(next);
  }

  function persistPreferences(next: ExplorerDisplayPreferences, refreshRoute = false) {
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
          if (refreshRoute && !result.error) router.refresh();
        }
      } catch {
        if (saveSequenceRef.current === sequence) {
          setSaveError('Explorer display preferences could not be saved.');
        }
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(save, save);
  }

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
    dragRef.current = {
      column,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: savedWidth ?? Math.round(header.getBoundingClientRect().width),
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
  );
}
