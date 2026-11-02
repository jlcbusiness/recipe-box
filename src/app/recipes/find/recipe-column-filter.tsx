'use client';

import { Filter, FilterX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  RecipeSearchColumnKey,
  RecipeSearchColumnSelections,
  RecipeSearchFilter,
  RecipeSearchSortKey,
} from '../../../lib/recipes/search';
import { useExplorerVisibleColumns } from '../../explorer-list-preferences';
import { Picklist } from '../../picklist';
import { useRecipeSearchMode } from './recipe-search-tabs';

export type RecipeColumnFilterKey = RecipeSearchColumnKey;
export type RecipeColumnFilterOption = { value: string; label: string };
export type MobileRecipeColumnFilterField = {
  field: RecipeColumnFilterKey;
  label: string;
  options: RecipeColumnFilterOption[];
};
export type MobileRecipeColumnFilterParam = { name: string; value: string };

export function RecipeColumnFilter({
  action,
  baseFilters,
  baseQuery,
  columnSelections,
  direction,
  field,
  fieldLabel,
  mainIngredientsOnly = false,
  compact = false,
  options,
  querySubmitted = false,
  selectedValues,
  sort,
  view,
}: {
  action: string;
  baseFilters: RecipeSearchFilter[];
  baseQuery: string;
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  field: RecipeColumnFilterKey;
  fieldLabel?: string;
  mainIngredientsOnly?: boolean;
  compact?: boolean;
  options: RecipeColumnFilterOption[];
  querySubmitted?: boolean;
  selectedValues?: string[];
  sort: RecipeSearchSortKey;
  view: 'details' | 'list' | 'grid';
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 12 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState(
    () => selectedValues ?? options.map(({ value }) => value),
  );
  const searchMode = useRecipeSearchMode();
  const [valueQuery, setValueQuery] = useState('');
  const availableOptions = [
    ...options,
    ...(selectedValues ?? [])
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: value })),
  ];
  const allSelected = availableOptions.length > 0 && selected.length === availableOptions.length;
  const visibleOptions = availableOptions.filter(({ label }) =>
    label.toLocaleLowerCase().includes(valueQuery.trim().toLocaleLowerCase()),
  );
  const parameterName = `column_${field}`;
  const labels: Partial<Record<RecipeColumnFilterKey, string>> = {
    name: 'Name',
    publication: 'Publication',
    state: 'State',
    visibility: 'Visibility',
    total_time_minutes: 'Total Time',
    opinion: 'Opinion',
    meal_type: 'Meal Type',
    food_type: 'Food Type',
    publication_page: 'Page',
    recipe_url: 'URL',
    citation: 'Citation',
    publication_source: 'Page or URL',
  };
  const label = fieldLabel ?? labels[field] ?? field;

  useEffect(() => {
    setSelected(selectedValues ?? options.map(({ value }) => value));
  }, [options, selectedValues]);

  useLayoutEffect(() => {
    if (!open) return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!bounds || !menu) return;

    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const menuBounds = menu.getBoundingClientRect();
    const menuWidth = Math.min(menuBounds.width, viewportWidth - 24);
    const menuHeight = menuBounds.height;
    const aboveSpace = Math.max(0, bounds.top - viewportTop - 12);
    const belowSpace = Math.max(0, viewportTop + viewportHeight - bounds.bottom - 12);
    const placeAbove = belowSpace < menuHeight && aboveSpace > belowSpace;
    const left = Math.max(
      viewportLeft + 12,
      Math.min(bounds.left, viewportLeft + viewportWidth - menuWidth - 12),
    );
    const desiredTop = placeAbove ? bounds.top - menuHeight - 5 : bounds.bottom + 5;
    const top = Math.max(
      viewportTop + 12,
      Math.min(desiredTop, viewportTop + viewportHeight - menuHeight - 12),
    );
    setMenuPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function closeOnPageScroll(event: Event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('focusin', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('scroll', closeOnPageScroll, true);
    window.addEventListener('resize', closeOnPageScroll);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('focusin', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('scroll', closeOnPageScroll, true);
      window.removeEventListener('resize', closeOnPageScroll);
    };
  }, [open]);

  function toggleMenu() {
    setOpen((current) => !current);
  }

  return (
    <div
      className={`recipe-column-filter${selectedValues ? ' is-filtered' : ''}`}
      ref={containerRef}
    >
      <button
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        className={`recipe-column-filter-trigger${compact ? ' recipe-column-filter-trigger-compact' : ''}`}
        onClick={toggleMenu}
        ref={triggerRef}
        title={`Filter ${label}`}
        type="button"
      >
        {compact ? <Filter aria-hidden="true" size={14} /> : label}
      </button>
      {open && (
        <div className="recipe-column-filter-popover" ref={menuRef} style={menuPosition}>
          <form action={action} method="get">
            {searchMode && <input name="tab" type="hidden" value={searchMode.mode} />}
            {searchMode?.mode === 'search' && baseQuery && (
              <input name="q" type="hidden" value={baseQuery} />
            )}
            {searchMode?.mode === 'search' && mainIngredientsOnly && (
              <input name="main" type="hidden" value="1" />
            )}
            {(searchMode?.mode === 'query' ? baseFilters : []).map((filter) => (
              <input
                key={JSON.stringify(filter)}
                name="filter"
                type="hidden"
                value={JSON.stringify(filter)}
              />
            ))}
            {Object.entries(columnSelections).flatMap(([key, values]) => {
              if (key === field || values === undefined) return [];
              const name = `column_${key}`;
              if (values.length === 0) {
                return [<input key={name} name={name} type="hidden" value="__none__" />];
              }
              return values.map((value) => (
                <input key={`${name}-${value}`} name={name} type="hidden" value={value} />
              ));
            })}
            <input name="sort" type="hidden" value={sort} />
            <input name="direction" type="hidden" value={direction} />
            <input name="view" type="hidden" value={view} />
            {querySubmitted && <input name="query_submitted" type="hidden" value="1" />}
            <label className="recipe-column-filter-search-label">
              <span className="sr-only">Search {label} values</span>
              <input
                autoComplete="off"
                onChange={(event) => setValueQuery(event.target.value)}
                placeholder="Search values"
                type="search"
                value={valueQuery}
              />
            </label>
            <fieldset aria-label={`${label} values`} className="recipe-column-filter-values">
              <legend className="sr-only">{label} values</legend>
              {visibleOptions.length > 0 ? (
                visibleOptions.map((option) => (
                  <label className="recipe-column-filter-option" key={option.value}>
                    <input
                      checked={selected.includes(option.value)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, option.value]
                            : current.filter((value) => value !== option.value),
                        )
                      }
                      type="checkbox"
                      value={option.value}
                    />
                    <span>{option.label}</span>
                  </label>
                ))
              ) : (
                <p className="recipe-column-filter-empty">No values found.</p>
              )}
            </fieldset>
            {selected.length === 0 ? (
              <input name={parameterName} type="hidden" value="__none__" />
            ) : allSelected ? (
              <input name={parameterName} type="hidden" value="__all__" />
            ) : (
              selected.map((value) => (
                <input key={value} name={parameterName} type="hidden" value={value} />
              ))
            )}
            <div className="recipe-column-filter-actions">
              <button
                className="recipe-column-filter-select-all"
                onClick={() =>
                  setSelected(
                    selected.length === 0 ? availableOptions.map(({ value }) => value) : [],
                  )
                }
                type="button"
              >
                {selected.length === 0 ? 'Select all' : 'Deselect all'}
              </button>
              <button className="recipe-column-filter-apply" type="submit">
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function MobileRecipeColumnFilters({
  action,
  baseFilters,
  baseQuery,
  clearParams = [],
  columnSelections,
  direction,
  fields,
  hasActiveFilters = false,
  mainIngredientsOnly = false,
  sort,
  view,
  querySubmitted = false,
  clearAction,
  showClearButton = true,
}: {
  action: string;
  baseFilters: RecipeSearchFilter[];
  baseQuery: string;
  clearParams?: MobileRecipeColumnFilterParam[];
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  fields: MobileRecipeColumnFilterField[];
  hasActiveFilters?: boolean;
  mainIngredientsOnly?: boolean;
  querySubmitted?: boolean;
  sort: RecipeSearchSortKey;
  view: 'details' | 'list' | 'grid';
  clearAction?: ReactNode;
  showClearButton?: boolean;
}) {
  const visibleColumns = useExplorerVisibleColumns();
  const availableFields = fields.filter(({ field }) => visibleColumns.includes(field));
  const [selectedFieldKeyState, setSelectedFieldKey] = useState<string>(fields[0]?.field ?? '');
  const selectedFieldKey = availableFields.some(({ field }) => field === selectedFieldKeyState)
    ? selectedFieldKeyState
    : availableFields[0]?.field;
  const selectedField = availableFields.find(({ field }) => field === selectedFieldKey);

  useEffect(() => {
    if (selectedFieldKey && selectedFieldKey !== selectedFieldKeyState) {
      setSelectedFieldKey(selectedFieldKey);
    }
  }, [selectedFieldKey, selectedFieldKeyState]);

  if (!selectedField) return null;

  const fieldOptions = availableFields.map(({ field, label }) => ({ value: field, label }));
  const clearParamCounts = new Map<string, number>();

  return (
    <div className="find-recipes-mobile-filter-controls">
      <RecipeColumnFilter
        action={action}
        baseFilters={baseFilters}
        baseQuery={baseQuery}
        columnSelections={columnSelections}
        compact
        direction={direction}
        field={selectedField.field}
        fieldLabel={selectedField.label}
        mainIngredientsOnly={mainIngredientsOnly}
        options={selectedField.options}
        querySubmitted={querySubmitted}
        selectedValues={columnSelections[selectedField.field]}
        sort={sort}
        view={view}
      />
      <Picklist
        className="find-recipes-mobile-filter-picklist"
        label="Column to filter"
        options={fieldOptions}
        sizeToContent={false}
        value={selectedField.field}
        onSelect={setSelectedFieldKey}
      />
      {clearAction}
      {showClearButton && (
        <form action={action} className="find-recipes-mobile-clear-form" method="get">
          {clearParams.map(({ name, value }) => {
            const paramKey = `${name}-${value}`;
            const duplicateCount = clearParamCounts.get(paramKey) ?? 0;
            clearParamCounts.set(paramKey, duplicateCount + 1);
            return (
              <input
                key={`${paramKey}-${duplicateCount}`}
                name={name}
                type="hidden"
                value={value}
              />
            );
          })}
          {querySubmitted && <input name="query_submitted" type="hidden" value="1" />}
          <button
            aria-label="Clear all column filters"
            className="recipe-explorer-trigger find-recipes-mobile-clear-button"
            disabled={!hasActiveFilters}
            title="Clear all column filters"
            type="submit"
          >
            <FilterX aria-hidden="true" size={16} />
            <span>Clear all</span>
          </button>
        </form>
      )}
    </div>
  );
}
