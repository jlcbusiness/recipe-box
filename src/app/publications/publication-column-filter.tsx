'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  PublicationSearchFilter,
  PublicationSearchFilterField,
  PublicationSearchSortKey,
} from '../../lib/publications/search';
import type { PublicationType } from '../../lib/recipes/data';
import { formatGroupedInteger, parseGroupedInteger } from '../../lib/recipes/measurement-rules';

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
  const parsedNumber = kind === 'number' ? parseGroupedInteger(normalizedValue) : null;
  const filterValue = kind === 'number' ? parsedNumber : normalizedValue;
  const invalidNumber =
    kind === 'number' && normalizedValue.length > 0 && (parsedNumber === null || parsedNumber < 0);
  const isValidValue = normalizedValue.length > 0 && (kind !== 'number' || !invalidNumber);

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
              aria-describedby={invalidNumber ? 'publication-column-filter-error' : undefined}
              aria-invalid={invalidNumber || undefined}
              inputMode={kind === 'number' ? 'text' : undefined}
              onChange={(event) => setValue(event.target.value)}
              onBlur={(event) => {
                if (kind !== 'number') return;
                const normalized = parseGroupedInteger(event.currentTarget.value);
                if (normalized !== null) setValue(formatGroupedInteger(normalized));
              }}
              placeholder={`Filter ${label.toLocaleLowerCase()}`}
              type={kind === 'date' ? 'date' : kind === 'number' ? 'text' : 'search'}
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
          {invalidNumber && (
            <p
              className="publication-column-filter-error"
              id="publication-column-filter-error"
              role="alert"
            >
              Enter a nonnegative whole number or arithmetic expression.
            </p>
          )}
          <div className="publication-column-filter-actions">
            <button onClick={() => setValue('')} type="button">
              Clear
            </button>
            <button disabled={invalidNumber} type="submit">
              Apply
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
