'use client';

import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  PublicationSearchFilter,
  PublicationSearchFilterField,
  PublicationSearchSortKey,
} from '../../lib/publications/search';
import type { PublicationType } from '../../lib/recipes/data';
import { formatGroupedInteger, parseGroupedInteger } from '../../lib/recipes/measurement-rules';
import { createUuid } from '../../lib/uuid';

type FilterKind = 'text' | 'enum' | 'multi' | 'number' | 'date';
type FilterDefinition = {
  field: PublicationSearchFilterField;
  label: string;
  kind: FilterKind;
};
type DraftFilter = {
  id: string;
  field: PublicationSearchFilterField | '';
  operator: string;
  value: string | string[];
  valueTo: string;
};
type Option = { value: string; label: string };

const definitions: FilterDefinition[] = [
  { field: 'name', label: 'Name', kind: 'text' },
  { field: 'author', label: 'Author', kind: 'text' },
  { field: 'edition', label: 'Edition', kind: 'text' },
  { field: 'isbn', label: 'ISBN', kind: 'text' },
  { field: 'retailer_url', label: 'Retailer URL', kind: 'text' },
  { field: 'site_url', label: 'Site URL', kind: 'text' },
  { field: 'publication_type', label: 'Type', kind: 'enum' },
  { field: 'tag', label: 'Tags', kind: 'multi' },
  { field: 'recipe_count', label: 'Recipe Count', kind: 'number' },
  { field: 'created_at', label: 'Date Added', kind: 'date' },
  { field: 'updated_at', label: 'Date Changed', kind: 'date' },
];

const operators: Record<FilterKind, Option[]> = {
  text: [
    { value: 'contains', label: 'Contains' },
    { value: 'does_not_contain', label: 'Does Not Contain' },
    { value: 'equals', label: 'Equals' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: 'Is Not Empty' },
  ],
  enum: [
    { value: 'in', label: 'Is' },
    { value: 'not_in', label: 'Is Not' },
  ],
  multi: [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: 'Is Not' },
    { value: 'contains_all', label: 'Contains All' },
    { value: 'contains_any', label: 'Contains Any' },
    { value: 'does_not_contain', label: 'Does Not Contain' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '!=' },
    { value: 'greater_than', label: '>' },
    { value: 'less_than', label: '<' },
    { value: 'at_least', label: '>=' },
    { value: 'at_most', label: '<=' },
    { value: 'between', label: 'Between' },
  ],
  date: [
    { value: 'equals', label: 'On' },
    { value: 'not_equals', label: 'Not On' },
    { value: 'greater_than', label: 'After' },
    { value: 'less_than', label: 'Before' },
    { value: 'at_least', label: 'On or After' },
    { value: 'at_most', label: 'On or Before' },
    { value: 'between', label: 'Between' },
  ],
};

const publicationTypeOptions: Option[] = [
  { value: 'book', label: 'Book' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'site', label: 'Site' },
  { value: 'collection', label: 'Recipe Tin' },
];

function definitionFor(field: PublicationSearchFilterField | '') {
  return definitions.find((definition) => definition.field === field);
}

function createDraft(filter: PublicationSearchFilter, index: number): DraftFilter {
  return {
    id: `publication-filter-${index}`,
    field: filter.field,
    operator: filter.operator,
    value: Array.isArray(filter.value)
      ? filter.value.map(String)
      : filter.value === undefined
        ? ''
        : String(filter.value),
    valueTo: filter.value_to === undefined ? '' : String(filter.value_to),
  };
}

function toFilter(draft: DraftFilter): PublicationSearchFilter | null {
  if (!draft.field) return null;
  if (draft.operator === 'is_empty' || draft.operator === 'is_not_empty') {
    return { field: draft.field, operator: draft.operator };
  }

  const kind = definitionFor(draft.field)?.kind;
  if (kind === 'enum' || kind === 'multi') {
    const values = Array.isArray(draft.value) ? draft.value : draft.value ? [draft.value] : [];
    return values.length ? { field: draft.field, operator: draft.operator, value: values } : null;
  }

  const value = Array.isArray(draft.value) ? '' : draft.value.trim();
  if (!value) return null;
  if (kind === 'number') {
    const number = parseGroupedInteger(value);
    const upper = parseGroupedInteger(draft.valueTo);
    if (
      number === null ||
      number < 0 ||
      (draft.operator === 'between' && (upper === null || upper < 0))
    ) {
      return null;
    }
    if (draft.operator === 'between') {
      if (upper === null) return null;
      return {
        field: draft.field,
        operator: draft.operator,
        value: number,
        value_to: upper,
      };
    }
    return {
      field: draft.field,
      operator: draft.operator,
      value: number,
    };
  }

  if (draft.operator === 'between' && !draft.valueTo) return null;
  return {
    field: draft.field,
    operator: draft.operator,
    value,
    ...(draft.operator === 'between' ? { value_to: draft.valueTo } : {}),
  };
}

function clearFiltersHref({
  query,
  type,
  sort,
  direction,
  view,
}: {
  query: string;
  type: 'all' | PublicationType;
  sort: PublicationSearchSortKey;
  direction: 'asc' | 'desc';
  view: 'list' | 'grid';
}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (type !== 'all') params.set('type', type);
  params.set('sort', sort);
  params.set('direction', direction);
  params.set('view', view);
  return `/publications?${params.toString()}`;
}

export function PublicationFilterBuilder({
  filters,
  tagOptions,
  query,
  type,
  sort,
  direction,
  view,
}: {
  filters: PublicationSearchFilter[];
  tagOptions: Option[];
  query: string;
  type: 'all' | PublicationType;
  sort: PublicationSearchSortKey;
  direction: 'asc' | 'desc';
  view: 'list' | 'grid';
}) {
  const [drafts, setDrafts] = useState(() => filters.map(createDraft));

  useEffect(() => {
    setDrafts(filters.map(createDraft));
  }, [filters]);

  const normalizedFilters = drafts.map(toFilter);
  const allDraftsComplete = drafts.every((draft, index) => {
    const kind = definitionFor(draft.field)?.kind;
    return Boolean(kind && normalizedFilters[index]);
  });
  const hasInvalidNumericValue = drafts.some((draft) => {
    if (definitionFor(draft.field)?.kind !== 'number') return false;
    const value = Array.isArray(draft.value) ? '' : draft.value.trim();
    const parsedValue = parseGroupedInteger(value);
    const parsedUpper = parseGroupedInteger(draft.valueTo);
    return (
      (Boolean(value) && (parsedValue === null || parsedValue < 0)) ||
      (draft.operator === 'between' &&
        Boolean(draft.valueTo.trim()) &&
        (parsedUpper === null || parsedUpper < 0))
    );
  });

  function updateDraft(id: string, changes: Partial<DraftFilter>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...changes } : draft)),
    );
  }

  return (
    <form action="/publications" className="publication-filter-form" method="get">
      {query && <input name="q" type="hidden" value={query} />}
      {type !== 'all' && <input name="type" type="hidden" value={type} />}
      <input name="sort" type="hidden" value={sort} />
      <input name="direction" type="hidden" value={direction} />
      <input name="view" type="hidden" value={view} />
      {normalizedFilters.map(
        (filter, index) =>
          filter && (
            <input
              key={drafts[index]?.id}
              name="filter"
              type="hidden"
              value={JSON.stringify(filter)}
            />
          ),
      )}
      {hasInvalidNumericValue && (
        <p
          className="publication-filter-number-error"
          id="publication-filter-number-error"
          role="alert"
        >
          Enter a nonnegative whole number or arithmetic expression for the highlighted filter.
        </p>
      )}

      <fieldset className="publication-filter-builder">
        <legend>Filter publications</legend>
        {drafts.map((draft, index) => {
          const definition = definitionFor(draft.field);
          const kind = definition?.kind;
          const noValue = draft.operator === 'is_empty' || draft.operator === 'is_not_empty';
          const between = draft.operator === 'between';
          const valueText = Array.isArray(draft.value) ? '' : draft.value;
          const parsedValue = kind === 'number' ? parseGroupedInteger(valueText) : null;
          const parsedUpper = kind === 'number' ? parseGroupedInteger(draft.valueTo) : null;
          const invalidValue =
            kind === 'number' &&
            Boolean(valueText.trim()) &&
            (parsedValue === null || parsedValue < 0);
          const invalidUpper =
            kind === 'number' &&
            between &&
            Boolean(draft.valueTo.trim()) &&
            (parsedUpper === null || parsedUpper < 0);
          const options =
            draft.field === 'publication_type'
              ? publicationTypeOptions
              : draft.field === 'tag'
                ? tagOptions
                : [];

          return (
            <fieldset
              className={`publication-filter-row${between ? ' publication-filter-row-between' : ''}`}
              key={draft.id}
            >
              <legend>Filter {index + 1}</legend>
              <label className="publication-filter-field">
                Field
                <select
                  aria-label={`Field for filter ${index + 1}`}
                  value={draft.field}
                  onChange={(event) => {
                    const field = event.currentTarget.value as PublicationSearchFilterField | '';
                    const nextKind = definitionFor(field)?.kind;
                    updateDraft(draft.id, {
                      field,
                      operator: nextKind
                        ? (operators[nextKind][0]?.value ?? 'contains')
                        : 'contains',
                      value: nextKind === 'enum' || nextKind === 'multi' ? [] : '',
                      valueTo: '',
                    });
                  }}
                >
                  <option value="">Choose field</option>
                  {definitions.map(({ field, label }) => (
                    <option key={field} value={field}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="publication-filter-operator">
                Operator
                <select
                  aria-label={`Operator for filter ${index + 1}`}
                  disabled={!kind}
                  value={draft.operator}
                  onChange={(event) =>
                    updateDraft(draft.id, { operator: event.currentTarget.value })
                  }
                >
                  {(kind ? operators[kind] : [{ value: 'contains', label: 'Contains' }]).map(
                    (operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label
                className="publication-filter-value"
                htmlFor={`publication-filter-value-${draft.id}`}
              >
                Value
                {kind === 'enum' || kind === 'multi' ? (
                  <select
                    aria-label={`Value for filter ${index + 1}`}
                    disabled={!kind}
                    id={`publication-filter-value-${draft.id}`}
                    multiple
                    size={Math.min(Math.max(options.length, 2), 4)}
                    value={Array.isArray(draft.value) ? draft.value : []}
                    onChange={(event) =>
                      updateDraft(draft.id, {
                        value: Array.from(
                          event.currentTarget.selectedOptions,
                          ({ value }) => value,
                        ),
                      })
                    }
                  >
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={`Value for filter ${index + 1}`}
                    aria-describedby={
                      invalidValue || invalidUpper ? 'publication-filter-number-error' : undefined
                    }
                    aria-invalid={invalidValue || undefined}
                    disabled={!kind || noValue}
                    id={`publication-filter-value-${draft.id}`}
                    maxLength={kind === 'text' ? 500 : undefined}
                    inputMode={kind === 'number' ? 'text' : undefined}
                    type={kind === 'date' ? 'date' : 'text'}
                    value={valueText}
                    onChange={(event) =>
                      updateDraft(draft.id, { value: event.currentTarget.value })
                    }
                    onBlur={(event) => {
                      if (kind !== 'number') return;
                      const normalized = parseGroupedInteger(event.currentTarget.value);
                      if (normalized !== null) {
                        updateDraft(draft.id, { value: formatGroupedInteger(normalized) });
                      }
                    }}
                  />
                )}
              </label>
              {between && (
                <label className="publication-filter-upper">
                  Through
                  <input
                    aria-label={`Upper value for filter ${index + 1}`}
                    aria-describedby={invalidUpper ? 'publication-filter-number-error' : undefined}
                    aria-invalid={invalidUpper || undefined}
                    inputMode={kind === 'number' ? 'text' : undefined}
                    type={kind === 'date' ? 'date' : 'text'}
                    value={draft.valueTo}
                    onChange={(event) =>
                      updateDraft(draft.id, { valueTo: event.currentTarget.value })
                    }
                    onBlur={(event) => {
                      if (kind !== 'number') return;
                      const normalized = parseGroupedInteger(event.currentTarget.value);
                      if (normalized !== null) {
                        updateDraft(draft.id, { valueTo: formatGroupedInteger(normalized) });
                      }
                    }}
                  />
                </label>
              )}
              <button
                aria-label={`Remove publication filter ${index + 1}`}
                className="publication-filter-remove"
                onClick={() => setDrafts((current) => current.filter(({ id }) => id !== draft.id))}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </fieldset>
          );
        })}
      </fieldset>

      <div className="publication-filter-actions">
        <button
          className="publication-filter-add"
          disabled={drafts.length >= 10}
          onClick={() =>
            setDrafts((current) => [
              ...current,
              {
                id: createUuid(),
                field: '',
                operator: 'contains',
                value: '',
                valueTo: '',
              },
            ])
          }
          type="button"
        >
          <Plus aria-hidden="true" size={16} />
          Add filter
        </button>
        <button className="publication-filter-apply" disabled={!allDraftsComplete} type="submit">
          Apply filters
        </button>
        <Link
          aria-disabled={filters.length === 0}
          className="publication-filter-clear"
          href={clearFiltersHref({ query, type, sort, direction, view })}
          onClick={(event) => {
            if (filters.length === 0) event.preventDefault();
          }}
        >
          Clear filters
        </Link>
      </div>
    </form>
  );
}
