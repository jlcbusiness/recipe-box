'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  PublicationSearchFilter,
  PublicationSearchFilterField,
  PublicationSearchSortKey,
} from '../../lib/publications/search';
import type { PublicationType } from '../../lib/recipes/data';

type FilterKind = 'date' | 'number' | 'text';

function initialValue(
  filters: PublicationSearchFilter[],
  field: PublicationSearchFilterField,
): string {
  const filter = filters.find((candidate) => candidate.field === field);
  return typeof filter?.value === 'string' || typeof filter?.value === 'number'
    ? String(filter.value)
    : '';
}

export function PublicationColumnFilter({
  direction,
  field,
  filters,
  kind,
  label,
  options,
  sort,
  type,
  view,
}: {
  direction: 'asc' | 'desc';
  field: PublicationSearchFilterField;
  filters: PublicationSearchFilter[];
  kind: FilterKind;
  label: string;
  options: string[];
  sort: PublicationSearchSortKey;
  type: 'all' | PublicationType;
  view: 'list' | 'grid';
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => initialValue(filters, field));
  const containerRef = useRef<HTMLDivElement>(null);
  const remainingFilters = filters.filter((filter) => filter.field !== field);
  const normalizedValue = value.trim();
  const filterValue = kind === 'number' ? Number(normalizedValue) : normalizedValue;
  const isValidValue =
    normalizedValue.length > 0 && (kind !== 'number' || Number.isFinite(filterValue));

  useEffect(() => {
    setValue(initialValue(filters, field));
  }, [field, filters]);

  useEffect(() => {
    function closeOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeWhenAnotherFilterOpens(event: Event) {
      if ((event as CustomEvent<PublicationSearchFilterField>).detail !== field) setOpen(false);
    }

    if (!open) return;
    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('focusin', closeOnOutsideInteraction);
    document.addEventListener('publication-column-filter-open', closeWhenAnotherFilterOpens);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('focusin', closeOnOutsideInteraction);
      document.removeEventListener('publication-column-filter-open', closeWhenAnotherFilterOpens);
    };
  }, [field, open]);

  const visibleOptions = options.filter((option) =>
    option.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
  );

  function togglePopover() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        document.dispatchEvent(
          new CustomEvent<PublicationSearchFilterField>('publication-column-filter-open', {
            detail: field,
          }),
        );
      }
      return next;
    });
  }

  return (
    <div className="publication-column-filter" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label={`Filter ${label}`}
        className="publication-column-filter-trigger"
        onClick={togglePopover}
        type="button"
      >
        {label}
      </button>
      {open && (
        <form action="/publications" className="publication-column-filter-popover" method="get">
          {remainingFilters.map((filter) => (
            <input
              key={JSON.stringify(filter)}
              name="filter"
              type="hidden"
              value={JSON.stringify(filter)}
            />
          ))}
          {isValidValue && (
            <input
              name="filter"
              type="hidden"
              value={JSON.stringify({
                field,
                operator: kind === 'text' ? 'contains' : 'equals',
                value: filterValue,
              })}
            />
          )}
          {type !== 'all' && <input name="type" type="hidden" value={type} />}
          <input name="sort" type="hidden" value={sort} />
          <input name="direction" type="hidden" value={direction} />
          <input name="view" type="hidden" value={view} />
          <label>
            <span className="sr-only">{label} filter</span>
            <input
              autoComplete="off"
              inputMode={kind === 'number' ? 'numeric' : undefined}
              onChange={(event) => setValue(event.target.value)}
              placeholder={`Filter ${label.toLocaleLowerCase()}`}
              type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'search'}
              value={value}
            />
          </label>
          {visibleOptions.length > 0 && (
            <div className="publication-column-filter-options" role="listbox">
              {visibleOptions.map((option) => (
                <button
                  aria-selected={option === value}
                  key={option}
                  onClick={() => setValue(option)}
                  role="option"
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="publication-column-filter-actions">
            <button onClick={() => setValue('')} type="button">
              Clear
            </button>
            <button type="submit">Apply</button>
          </div>
        </form>
      )}
    </div>
  );
}
