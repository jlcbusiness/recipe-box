'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RecipeSearchFilter, RecipeSearchFilterField } from '../../../lib/recipes/search';
import { createUuid } from '../../../lib/uuid';
import { Picklist } from '../../picklist';
import { MultiPicklist } from '../multi-picklist';
import { useRecipeSearchMode } from './recipe-search-tabs';

type FilterOption = { value: string; label: string };
type RecipeFilterOptions = {
  food_type: FilterOption[];
  visibility: FilterOption[];
  meal_type: FilterOption[];
  cuisine: FilterOption[];
  equipment: FilterOption[];
  ingredient: FilterOption[];
  verdict: FilterOption[];
  enthusiasm: FilterOption[];
  publication_id: FilterOption[];
  tag: FilterOption[];
};
type FilterKind = 'text' | 'enum' | 'multi' | 'marker' | 'number' | 'date';
type FilterDefinition = {
  field: RecipeSearchFilterField;
  label: string;
  kind: FilterKind;
};
type DraftFilter = {
  id: string;
  field: RecipeSearchFilterField | '';
  operator: string;
  value: string | string[];
  valueTo: string;
};

const filterDefinitions: FilterDefinition[] = [
  { field: 'name', label: 'Name', kind: 'text' },
  { field: 'notes_markdown', label: 'Notes', kind: 'text' },
  { field: 'reason', label: 'Reason', kind: 'text' },
  { field: 'occasion_details', label: 'Occasion Details', kind: 'text' },
  { field: 'publication_author', label: 'Publication Author', kind: 'text' },
  { field: 'ingredient', label: 'Ingredient', kind: 'multi' },
  { field: 'state', label: 'State', kind: 'enum' },
  { field: 'visibility', label: 'Visibility', kind: 'enum' },
  { field: 'food_type', label: 'Food Type', kind: 'enum' },
  { field: 'verdict', label: 'Verdict', kind: 'enum' },
  { field: 'enthusiasm', label: 'Enthusiasm', kind: 'enum' },
  { field: 'publication_id', label: 'Publication Name', kind: 'enum' },
  { field: 'meal_type', label: 'Meal Type', kind: 'multi' },
  { field: 'cuisine', label: 'Cuisine', kind: 'multi' },
  { field: 'equipment', label: 'Equipment', kind: 'multi' },
  { field: 'tag', label: 'Tags', kind: 'multi' },
  { field: 'serves', label: 'Serves', kind: 'number' },
  { field: 'prep_time_minutes', label: 'Prep Time', kind: 'number' },
  { field: 'mixing_time_minutes', label: 'Mixing Time', kind: 'number' },
  { field: 'marinate_time_minutes', label: 'Marinate Time', kind: 'number' },
  { field: 'chill_time_minutes', label: 'Chill Time', kind: 'number' },
  { field: 'freeze_time_minutes', label: 'Freeze Time', kind: 'number' },
  { field: 'cook_time_minutes', label: 'Cook Time', kind: 'number' },
  { field: 'bake_time_minutes', label: 'Bake Time', kind: 'number' },
  { field: 'cooling_time_minutes', label: 'Cooling Time', kind: 'number' },
  { field: 'rest_time_minutes', label: 'Rest Time', kind: 'number' },
  { field: 'total_time_minutes', label: 'Total Time', kind: 'number' },
  { field: 'score', label: 'Rating', kind: 'number' },
  { field: 'starred', label: 'Starred', kind: 'marker' },
  { field: 'hearted', label: 'Hearted', kind: 'marker' },
  { field: 'created_at', label: 'Date Added', kind: 'date' },
  { field: 'updated_at', label: 'Date Changed', kind: 'date' },
];

const markerOptions: FilterOption[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const operators: Record<FilterKind, { value: string; label: string }[]> = {
  text: [
    { value: 'contains', label: 'Contains' },
    { value: 'does_not_contain', label: 'Contains no' },
    { value: 'equals', label: 'Equals' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: "Isn't Empty" },
  ],
  enum: [
    { value: 'in', label: 'Is' },
    { value: 'not_in', label: "Isn't" },
  ],
  multi: [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: "Isn't" },
    { value: 'contains_all', label: 'Has' },
    { value: 'contains_any', label: 'Has Any' },
    { value: 'does_not_contain', label: "Doesn't Have" },
  ],
  marker: [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: "Isn't" },
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

const stateOptions: FilterOption[] = [
  { value: 'want_to_try', label: 'Want to Try' },
  { value: 'tried', label: 'Tried' },
  { value: 'will_not_try', label: 'Will Not Try' },
];
const visibilityOptions: FilterOption[] = [
  { value: 'private', label: 'Private' },
  { value: 'linkable', label: 'Linkable' },
];

function definitionFor(field: RecipeSearchFilterField | '') {
  return filterDefinitions.find((definition) => definition.field === field);
}

function optionsFor(field: RecipeSearchFilterField | '', options: RecipeFilterOptions) {
  if (field === 'state') return stateOptions;
  if (field === 'visibility') return options.visibility;
  if (field === 'starred' || field === 'hearted') return markerOptions;
  if (
    field === 'food_type' ||
    field === 'meal_type' ||
    field === 'cuisine' ||
    field === 'equipment' ||
    field === 'ingredient' ||
    field === 'verdict' ||
    field === 'enthusiasm' ||
    field === 'publication_id' ||
    field === 'tag'
  ) {
    return options[field];
  }
  return [];
}

function filterValue(filter: DraftFilter, kind: FilterKind): RecipeSearchFilter | null {
  if (!filter.field) return null;
  const operator = filter.operator;
  const hasNoValue = operator === 'is_empty' || operator === 'is_not_empty';
  const value = filter.value;
  if (!hasNoValue && (Array.isArray(value) ? value.length === 0 : !value.trim())) return null;
  if (operator === 'between' && !filter.valueTo.trim()) return null;
  if (hasNoValue) return { field: filter.field, operator };

  if (kind === 'marker') {
    const values = Array.isArray(value) ? value : [value];
    if (values.length !== 1 || !markerOptions.some(({ value: option }) => option === values[0])) {
      return null;
    }
    return { field: filter.field, operator, value: values };
  }
  if (kind === 'enum' || kind === 'multi') {
    return { field: filter.field, operator, value: Array.isArray(value) ? value : [value] };
  }
  if (kind === 'number') {
    return {
      field: filter.field,
      operator,
      value: Number(value),
      ...(operator === 'between' ? { value_to: Number(filter.valueTo) } : {}),
    };
  }
  if (kind === 'date' && operator === 'between') {
    return { field: filter.field, operator, value: String(value), value_to: filter.valueTo };
  }
  return { field: filter.field, operator, value: String(value) };
}

function createDraft(filter: RecipeSearchFilter, index: number): DraftFilter {
  return {
    id: `filter-${index}`,
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

export function RecipeFilterBuilder({
  filters,
  options,
  title = 'Filters',
  maxFilters = 10,
}: {
  filters: RecipeSearchFilter[];
  options: RecipeFilterOptions;
  title?: string;
  maxFilters?: number;
}) {
  const [drafts, setDrafts] = useState(() => filters.map(createDraft));
  const draftsRef = useRef(drafts);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const [openPicklistId, setOpenPicklistId] = useState<string | null>(null);
  const builderRef = useRef<HTMLFieldSetElement | null>(null);
  const searchMode = useRecipeSearchMode();
  const mode = searchMode?.mode;
  const previousModeRef = useRef(mode);

  useEffect(() => {
    if (!focusRuleId) return;
    builderRef.current
      ?.querySelector<HTMLElement>(
        `[data-filter-rule-id="${focusRuleId}"] .recipe-filter-field-control`,
      )
      ?.focus();
    setFocusRuleId(null);
  }, [focusRuleId]);

  useEffect(() => {
    if (previousModeRef.current === mode) return;
    previousModeRef.current = mode;
    draftsRef.current = [];
    setDrafts([]);
    setOpenPicklistId(null);
  }, [mode]);

  function isCompleteDraft(draft: DraftFilter) {
    const kind = definitionFor(draft.field)?.kind;
    return Boolean(kind && filterValue(draft, kind));
  }

  function requestQuerySubmit() {
    const currentDrafts = draftsRef.current;
    if (!currentDrafts.every(isCompleteDraft)) return false;
    const form = builderRef.current?.form;
    if (!form?.checkValidity()) return false;
    form.requestSubmit();
    return true;
  }

  function updateDraft(id: string, changes: Partial<DraftFilter>) {
    draftsRef.current = draftsRef.current.map((draft) =>
      draft.id === id ? { ...draft, ...changes } : draft,
    );
    setDrafts(draftsRef.current);
  }

  function addRule() {
    if (draftsRef.current.length >= maxFilters) return;
    const id = createUuid();
    draftsRef.current = [
      ...draftsRef.current,
      { id, field: '', operator: 'contains', value: '', valueTo: '' },
    ];
    setDrafts(draftsRef.current);
    setFocusRuleId(id);
  }

  function removeRule(id: string) {
    draftsRef.current = draftsRef.current.filter((draft) => draft.id !== id);
    setDrafts(draftsRef.current);
  }

  function clearRules() {
    draftsRef.current = [];
    setDrafts([]);
  }

  return (
    <fieldset className="recipe-filter-builder" disabled={mode !== 'query'} ref={builderRef}>
      <legend>{title}</legend>
      {drafts.map((draft, index) => {
        const definition = definitionFor(draft.field);
        const kind = definition?.kind;
        const availableOperators =
          kind === 'number' && draft.field === 'score'
            ? [
                ...operators.number,
                { value: 'is_not_empty', label: 'Exists' },
                { value: 'is_empty', label: "Doesn't Exist" },
              ]
            : kind
              ? operators[kind]
              : [];
        const fieldOptions = [
          { value: '', label: 'Choose field' },
          ...filterDefinitions.map(({ field, label }) => ({ value: field, label })),
        ];
        const valueOptions = optionsFor(draft.field, options);
        const normalizedFilter = kind ? filterValue(draft, kind) : null;
        const isEmptyOperator = draft.operator === 'is_empty' || draft.operator === 'is_not_empty';
        const isBetween = draft.operator === 'between';
        const fieldControlId = `${draft.id}-field`;
        const operatorControlId = `${draft.id}-operator`;
        const valueControlId = `${draft.id}-value`;
        const valueToControlId = `${draft.id}-value-to`;
        const selectedMarkerValue = Array.isArray(draft.value)
          ? (draft.value[0] ?? '')
          : draft.value;
        return (
          <fieldset
            aria-label={`Filter ${index + 1}`}
            className="recipe-filter-row"
            data-filter-rule-id={draft.id}
            key={draft.id}
          >
            <label className="visually-hidden recipe-filter-field-label" htmlFor={fieldControlId}>
              Field
            </label>
            <Picklist
              className="recipe-picklist-trigger recipe-filter-field-control"
              id={fieldControlId}
              label="Field"
              menuClassName="recipe-filter-single-menu"
              onEnter={requestQuerySubmit}
              onOpenChange={(isOpen) => setOpenPicklistId(isOpen ? fieldControlId : null)}
              onSelect={(fieldValue) => {
                const field = fieldValue as RecipeSearchFilterField | '';
                const nextKind = definitionFor(field)?.kind;
                updateDraft(draft.id, {
                  field,
                  operator: nextKind ? (operators[nextKind][0]?.value ?? '') : '',
                  value: '',
                  valueTo: '',
                });
              }}
              open={openPicklistId === fieldControlId}
              options={fieldOptions}
              scope="recipe-filter-builder"
              sizeToContent={false}
              value={draft.field}
            >
              <span className="recipe-filter-picklist-label">{definition?.label ?? 'Field'}</span>
            </Picklist>

            <label
              className="visually-hidden recipe-filter-operator-label"
              htmlFor={operatorControlId}
            >
              Operator
            </label>
            <Picklist
              className="recipe-picklist-trigger recipe-filter-operator-control"
              disabled={!kind}
              id={operatorControlId}
              label="Operator"
              menuClassName="recipe-filter-single-menu"
              onEnter={requestQuerySubmit}
              onOpenChange={(isOpen) => setOpenPicklistId(isOpen ? operatorControlId : null)}
              onSelect={(operator) => updateDraft(draft.id, { operator })}
              open={openPicklistId === operatorControlId}
              options={availableOperators}
              scope="recipe-filter-builder"
              value={draft.operator}
            >
              <span className="recipe-filter-picklist-label">
                {availableOperators.find(({ value }) => value === draft.operator)?.label ?? '—'}
              </span>
            </Picklist>

            {!isEmptyOperator && (
              <>
                <label
                  className="visually-hidden recipe-filter-value-label"
                  htmlFor={valueControlId}
                >
                  Value
                </label>
                {kind === 'enum' || kind === 'multi' ? (
                  <MultiPicklist
                    controlId={valueControlId}
                    emptyLabel="Select values"
                    filterMode
                    includeHiddenInputs={false}
                    isOpen={openPicklistId === valueControlId}
                    label="Value"
                    onClose={() => setOpenPicklistId(null)}
                    onEnter={requestQuerySubmit}
                    onSelectionChange={(value) => updateDraft(draft.id, { value })}
                    onToggle={() =>
                      setOpenPicklistId((current) =>
                        current === valueControlId ? null : valueControlId,
                      )
                    }
                    selectedIds={Array.isArray(draft.value) ? draft.value : []}
                    values={valueOptions.map(({ value, label }) => ({
                      id: value,
                      display_value: label,
                    }))}
                  />
                ) : kind === 'marker' ? (
                  <Picklist
                    className="recipe-picklist-trigger recipe-filter-value-trigger"
                    id={valueControlId}
                    label="Value"
                    menuClassName="recipe-filter-single-menu"
                    onEnter={requestQuerySubmit}
                    onOpenChange={(isOpen) => setOpenPicklistId(isOpen ? valueControlId : null)}
                    onSelect={(value) => updateDraft(draft.id, { value })}
                    open={openPicklistId === valueControlId}
                    options={valueOptions}
                    scope="recipe-filter-builder"
                    sizeToContent={false}
                    value={selectedMarkerValue}
                  >
                    <span className="recipe-filter-picklist-label">
                      {valueOptions.find(({ value }) => value === selectedMarkerValue)?.label ??
                        'Value'}
                    </span>
                  </Picklist>
                ) : (
                  <input
                    className="recipe-filter-value-control"
                    disabled={!kind}
                    id={valueControlId}
                    maxLength={kind === 'text' ? 500 : undefined}
                    min={draft.field === 'score' ? -5 : kind === 'number' ? 0 : undefined}
                    max={draft.field === 'score' ? 5 : undefined}
                    required={Boolean(kind)}
                    step={draft.field === 'serves' ? 'any' : kind === 'number' ? 1 : undefined}
                    type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
                    value={Array.isArray(draft.value) ? '' : draft.value}
                    onChange={(event) => updateDraft(draft.id, { value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        requestQuerySubmit();
                      }
                    }}
                  />
                )}
                {isBetween && kind && (
                  <>
                    <label className="recipe-filter-value-to-label" htmlFor={valueToControlId}>
                      Through
                    </label>
                    <input
                      className="recipe-filter-value-to-control"
                      id={valueToControlId}
                      min={draft.field === 'score' ? -5 : kind === 'number' ? 0 : undefined}
                      max={draft.field === 'score' ? 5 : undefined}
                      required
                      step={draft.field === 'serves' ? 'any' : kind === 'number' ? 1 : undefined}
                      type={kind === 'number' ? 'number' : 'date'}
                      value={draft.valueTo}
                      onChange={(event) => updateDraft(draft.id, { valueTo: event.target.value })}
                    />
                  </>
                )}
              </>
            )}

            {normalizedFilter && (
              <input name="filter" type="hidden" value={JSON.stringify(normalizedFilter)} />
            )}
            <button
              aria-label={`Remove filter ${index + 1}`}
              className="recipe-filter-remove recipe-ingredient-delete-button"
              onClick={() => removeRule(draft.id)}
              title={`Remove filter ${index + 1}`}
              type="button"
            >
              <X aria-hidden="true" size={30} strokeWidth={1.35} />
            </button>
          </fieldset>
        );
      })}
      <div className="recipe-filter-actions">
        <button
          className="recipe-filter-add"
          disabled={drafts.length >= maxFilters}
          onClick={addRule}
          type="button"
        >
          <span className="recipe-ingredient-empty-prompt">add rule</span>
        </button>
        <div className="recipe-filter-action-buttons">
          {drafts.length > 0 && (
            <button className="recipe-filter-clear-all" onClick={clearRules} type="button">
              <span className="recipe-ingredient-empty-prompt">clear all</span>
            </button>
          )}
          <button
            className="recipe-filter-apply"
            disabled={!drafts.every(isCompleteDraft)}
            type="submit"
          >
            apply
          </button>
        </div>
      </div>
    </fieldset>
  );
}
