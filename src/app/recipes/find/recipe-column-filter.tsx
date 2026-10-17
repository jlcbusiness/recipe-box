'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  RecipeSearchColumnKey,
  RecipeSearchColumnSelections,
  RecipeSearchFilter,
  RecipeSearchSortKey,
} from '../../../lib/recipes/search';
import { useRecipeSearchMode } from './recipe-search-tabs';

export type RecipeColumnFilterKey = RecipeSearchColumnKey;
export type RecipeColumnFilterOption = { value: string; label: string };

export function RecipeColumnFilter({
  action,
  baseFilters,
  baseQuery,
  columnSelections,
  direction,
  field,
  options,
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
  options: RecipeColumnFilterOption[];
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
  const labels: Record<RecipeColumnFilterKey, string> = {
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
  const label = labels[field];

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

    function closeOnPageScroll() {
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
        className="recipe-column-filter-trigger"
        onClick={toggleMenu}
        ref={triggerRef}
        type="button"
      >
        {label}
      </button>
      {open && (
        <div className="recipe-column-filter-popover" ref={menuRef} style={menuPosition}>
          <form action={action} method="get">
            {searchMode && <input name="tab" type="hidden" value={searchMode.mode} />}
            {searchMode?.mode === 'search' && baseQuery && (
              <input name="q" type="hidden" value={baseQuery} />
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
            <label className="recipe-column-filter-search-label">
              <span className="sr-only">Search {field} values</span>
              <input
                autoComplete="off"
                onChange={(event) => setValueQuery(event.target.value)}
                placeholder="Search values"
                type="search"
                value={valueQuery}
              />
            </label>
            <button
              className="recipe-column-filter-select-all"
              onClick={() =>
                setSelected(selected.length === 0 ? availableOptions.map(({ value }) => value) : [])
              }
              type="button"
            >
              {selected.length === 0 ? 'Select all' : 'Deselect all'}
            </button>
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
            <button className="recipe-column-filter-apply" type="submit">
              Apply
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
