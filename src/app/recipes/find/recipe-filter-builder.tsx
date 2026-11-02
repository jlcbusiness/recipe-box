'use client';

import { ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type BoundQueryExpression,
  bindQueryExpression,
  type DeletedRuleReference,
  DeletedRuleReferenceError,
  encodeAdvancedRules,
  type QueryRule,
  readAdvancedRules,
  renumberQueryExpression,
} from '../../../lib/query-logic';
import {
  STANDARD_NUTRIENT_FIELDS,
  STANDARD_NUTRIENT_KEYS,
} from '../../../lib/recipes/nutrition-rules';
import type { RecipeSearchFilter, RecipeSearchFilterField } from '../../../lib/recipes/search';
import { createUuid } from '../../../lib/uuid';
import { Picklist } from '../../picklist';
import { MultiPicklist } from '../multi-picklist';
import { AdvancedRulesPane, renderHighlightedExpression } from './advanced-rules-pane';
import { useRecipeSearchMode } from './recipe-search-tabs';

type FilterOption = { value: string; label: string };
type RecipeFilterOptions = {
  food_type: FilterOption[];
  visibility: FilterOption[];
  meal_type: FilterOption[];
  cuisine: FilterOption[];
  equipment: FilterOption[];
  ingredient: FilterOption[];
  main_ingredient: FilterOption[];
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
  { field: 'main_ingredient', label: 'Main Ingredient', kind: 'multi' },
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
  ...STANDARD_NUTRIENT_FIELDS.map(({ key: field, label }) => ({
    field,
    label,
    kind: 'number' as const,
  })),
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

const standardNutrientFilterFields = new Set<string>(STANDARD_NUTRIENT_KEYS);

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

const compactOperatorLabels: Record<string, string> = {
  'text:contains': 'Has',
  'text:does_not_contain': 'No',
  'text:equals': 'Is',
  'text:starts_with': 'Beg.',
  'text:is_empty': 'None',
  'text:is_not_empty': 'Set',
  'enum:not_in': 'Not',
  'multi:is_not': 'Not',
  'multi:contains_all': 'All',
  'multi:contains_any': 'Any',
  'multi:does_not_contain': 'No',
  'marker:is_not': 'Not',
  'number:between': 'Rng',
  'number:is_empty': 'None',
  'number:is_not_empty': 'Set',
  'date:not_equals': 'Not',
  'date:greater_than': 'Aft.',
  'date:less_than': 'Bef.',
  'date:at_least': 'On+',
  'date:at_most': 'On-',
  'date:between': 'Rng',
};

const stateOptions: FilterOption[] = [
  { value: 'want_to_try', label: 'Want to Try' },
  { value: 'tried', label: 'Tried' },
  { value: 'will_not_try', label: 'Will Not Try' },
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
    field === 'main_ingredient' ||
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
    if (
      !Number.isFinite(Number(value)) ||
      (operator === 'between' && !Number.isFinite(Number(filter.valueTo)))
    )
      return null;
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
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
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

function sameDraftValue(left: string | string[], right: string | string[]) {
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function expressionSegments(current: string, previous: string) {
  let prefixLength = 0;
  while (
    prefixLength < current.length &&
    prefixLength < previous.length &&
    current[prefixLength] === previous[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < current.length - prefixLength &&
    suffixLength < previous.length - prefixLength &&
    current[current.length - suffixLength - 1] === previous[previous.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  return {
    before: current.slice(0, prefixLength),
    changed: current.slice(prefixLength, current.length - suffixLength),
    after: suffixLength ? current.slice(current.length - suffixLength) : '',
    removed: previous.slice(prefixLength, previous.length - suffixLength),
  };
}

function initialQuery(filters: RecipeSearchFilter[]) {
  const envelopes = filters.filter(({ field }) => field === 'advanced_rules');
  const envelope = envelopes[0];
  if (!envelope)
    return { drafts: filters.map(createDraft), expression: null, error: '', invalidText: '' };
  if (envelopes.length > 1) {
    return {
      drafts: [],
      expression: null,
      error:
        'Only one Advanced Rules expression is allowed. Clear the invalid query to start again.',
      invalidText: '',
    };
  }
  try {
    const advanced = readAdvancedRules(envelope);
    const drafts = advanced.rules.map((rule, index) => {
      if (!isBuilderRule(rule)) throw new Error(`Unsupported Advanced Rules field: ${rule.field}`);
      return { ...createDraft(rule, index), id: rule.id };
    });
    const ids = new Set(drafts.map(({ id }) => id));
    let nextIndex = drafts.length;
    for (const filter of filters.filter(({ field }) => field !== 'advanced_rules')) {
      let draft = createDraft(filter, nextIndex++);
      while (ids.has(draft.id)) draft = createDraft(filter, nextIndex++);
      ids.add(draft.id);
      drafts.push(draft);
    }
    try {
      const bound = bindQueryExpression(
        advanced.text,
        drafts.map(({ id }) => id),
      );
      if (!bound) throw new Error('Advanced Rules expression is empty.');
      return {
        drafts,
        expression: bound,
        error: '',
        invalidText: '',
      };
    } catch (failure) {
      if (!(failure instanceof Error)) throw failure;
      return { drafts, expression: null, error: failure.message, invalidText: advanced.text };
    }
  } catch (failure) {
    if (!(failure instanceof Error)) throw failure;
    return { drafts: [], expression: null, error: failure.message, invalidText: '' };
  }
}

function isBuilderRule(rule: QueryRule): rule is QueryRule & { field: RecipeSearchFilterField } {
  return filterDefinitions.some(({ field }) => field === rule.field);
}

export function RecipeFilterBuilder({
  disableAutoSelectColumns = false,
  showAutoSelectColumns = true,
  querySubmitted = false,
  filters,
  options,
  title = 'Filters',
  maxFilters = 10,
}: {
  disableAutoSelectColumns?: boolean;
  showAutoSelectColumns?: boolean;
  querySubmitted?: boolean;
  filters: RecipeSearchFilter[];
  options: RecipeFilterOptions;
  title?: string;
  maxFilters?: number;
}) {
  const initial = useMemo(() => initialQuery(filters), [filters]);
  const [drafts, setDrafts] = useState(initial.drafts);
  const [expression, setExpression] = useState<BoundQueryExpression | null>(initial.expression);
  const [initialError, setInitialError] = useState(initial.error);
  const [invalidText, setInvalidText] = useState(initial.invalidText);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const advancedLinkRef = useRef<HTMLButtonElement>(null);
  const draftsRef = useRef(drafts);
  const ruleNumbersRef = useRef(
    new Map(initial.drafts.map((draft, index) => [draft.id, index + 1])),
  );
  const nextRuleNumberRef = useRef(initial.drafts.length + 1);
  const [removedDraftRules, setRemovedDraftRules] = useState<{ id: string; number: number }[]>([]);
  const [disableColumnAutoSelect, setDisableColumnAutoSelect] = useState(disableAutoSelectColumns);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const [openPicklistId, setOpenPicklistId] = useState<string | null>(null);
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<string>>(() => new Set());
  const builderRef = useRef<HTMLFieldSetElement | null>(null);
  const searchMode = useRecipeSearchMode();
  const mode = searchMode?.mode;
  const previousModeRef = useRef(mode);
  const filterSignature = JSON.stringify(filters);
  const previousFiltersRef = useRef(filterSignature);
  const hasSubmittedQuery = querySubmitted || filters.length > 0;
  const appliedDrafts = new Map(initial.drafts.map((draft) => [draft.id, draft]));
  const numberedDrafts = drafts.map((draft) => {
    const number = ruleNumbersRef.current.get(draft.id);
    if (number === undefined) throw new Error(`Missing displayed number for rule ${draft.id}.`);
    return { draft, number };
  });
  const deletedRuleCandidates = new Map<string, { id: string; number: number }>();
  if (hasSubmittedQuery) {
    for (const [index, draft] of initial.drafts.entries()) {
      if (drafts.some(({ id }) => id === draft.id)) continue;
      deletedRuleCandidates.set(draft.id, { id: draft.id, number: index + 1 });
    }
  }
  for (const rule of removedDraftRules) {
    if (!drafts.some(({ id }) => id === rule.id)) deletedRuleCandidates.set(rule.id, rule);
  }
  const highestActiveRuleNumber = Math.max(0, ...numberedDrafts.map(({ number }) => number));
  const deletedRules = [...deletedRuleCandidates.values()]
    .filter(
      ({ id, number }) =>
        hasSubmittedQuery ||
        number < highestActiveRuleNumber ||
        Boolean(expression?.references.some((reference) => reference.id === id)),
    )
    .sort((left, right) => left.number - right.number);
  const ruleIdsByNumber = new Map(numberedDrafts.map(({ draft, number }) => [number, draft.id]));
  const highestRuleNumber = Math.max(
    highestActiveRuleNumber,
    ...deletedRules.map(({ number }) => number),
  );
  const ruleSlots = Array.from(
    { length: highestRuleNumber },
    (_, index) => ruleIdsByNumber.get(index + 1) ?? null,
  );
  const ruleEntries = [
    ...numberedDrafts.map(({ draft, number }) => ({ kind: 'active' as const, draft, number })),
    ...deletedRules.map(({ id, number }) => ({ kind: 'deleted' as const, id, number })),
  ].sort((left, right) => left.number - right.number);
  const appliedExpression = initial.expression?.text ?? initial.invalidText;
  const currentExpression = expression?.text ?? invalidText;
  const expressionChanged = hasSubmittedQuery && currentExpression !== appliedExpression;
  const expressionChange = expressionChanged
    ? expressionSegments(currentExpression, appliedExpression)
    : null;
  const expressionStatusId = 'recipe-filter-expression-staged-status';
  const logicErrorId = 'recipe-filter-logic-error';

  useEffect(() => {
    if (previousFiltersRef.current === filterSignature) return;
    previousFiltersRef.current = filterSignature;
    draftsRef.current = initial.drafts;
    ruleNumbersRef.current = new Map(initial.drafts.map((draft, index) => [draft.id, index + 1]));
    nextRuleNumberRef.current = initial.drafts.length + 1;
    setDrafts(initial.drafts);
    setRemovedDraftRules([]);
    setExpression(initial.expression);
    setInitialError(initial.error);
    setInvalidText(initial.invalidText);
    setIsAdvancedOpen(false);
    setExpandedRuleIds(new Set());
  }, [filterSignature, initial]);

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
    ruleNumbersRef.current.clear();
    nextRuleNumberRef.current = 1;
    setRemovedDraftRules([]);
    setDrafts([]);
    setOpenPicklistId(null);
    setExpandedRuleIds(new Set());
    setExpression(null);
    setInitialError('');
    setInvalidText('');
    setIsAdvancedOpen(false);
  }, [mode]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 721px)');
    function collapseExpandedRows() {
      if (desktop.matches) setExpandedRuleIds(new Set());
    }
    desktop.addEventListener('change', collapseExpandedRows);
    return () => desktop.removeEventListener('change', collapseExpandedRows);
  }, []);

  function isCompleteDraft(draft: DraftFilter) {
    const kind = definitionFor(draft.field)?.kind;
    return Boolean(kind && filterValue(draft, kind));
  }

  function requestQuerySubmit() {
    const currentDrafts = draftsRef.current;
    if (!currentDrafts.every(isCompleteDraft) || logicError) return false;
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

  function toggleRuleExpanded(id: string) {
    setExpandedRuleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addRule() {
    if (draftsRef.current.length >= maxFilters) return;
    const id = createUuid();
    ruleNumbersRef.current.set(id, nextRuleNumberRef.current);
    nextRuleNumberRef.current += 1;
    draftsRef.current = [
      ...draftsRef.current,
      { id, field: '', operator: 'contains', value: '', valueTo: '' },
    ];
    setDrafts(draftsRef.current);
    setFocusRuleId(id);
  }

  function rememberRemovedRules(removedDrafts: DraftFilter[]) {
    const removed = removedDrafts.map((draft) => {
      const number = ruleNumbersRef.current.get(draft.id);
      if (number === undefined) throw new Error(`Missing displayed number for rule ${draft.id}.`);
      return { id: draft.id, number };
    });
    setRemovedDraftRules((current) => {
      const byId = new Map(current.map((rule) => [rule.id, rule]));
      for (const rule of removed) byId.set(rule.id, rule);
      return [...byId.values()];
    });
  }

  function removeRule(id: string) {
    const removedDraft = draftsRef.current.find((draft) => draft.id === id);
    if (!removedDraft) throw new Error(`Cannot remove missing query rule ${id}.`);
    rememberRemovedRules([removedDraft]);
    draftsRef.current = draftsRef.current.filter((draft) => draft.id !== id);
    setDrafts(draftsRef.current);
    setExpandedRuleIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function clearRules() {
    rememberRemovedRules(draftsRef.current);
    draftsRef.current = [];
    setDrafts([]);
    setExpandedRuleIds(new Set());
    setExpression(null);
    setInitialError('');
    setInvalidText('');
  }

  let logicError = initialError;
  let deletedRuleReferences: DeletedRuleReference[] = [];
  if (expression) {
    try {
      bindQueryExpression(expression.text, ruleSlots);
    } catch (failure) {
      if (!(failure instanceof Error)) throw failure;
      logicError = failure.message;
      if (failure instanceof DeletedRuleReferenceError) {
        deletedRuleReferences = failure.references;
      }
    }
  }
  const completeRules = drafts.flatMap((draft) => {
    const kind = definitionFor(draft.field)?.kind;
    const filter = kind ? filterValue(draft, kind) : null;
    return filter ? [{ ...filter, id: draft.id }] : [];
  });
  let expressionFilter: ReturnType<typeof encodeAdvancedRules> | null = null;
  if (expression && !logicError && completeRules.length === drafts.length) {
    try {
      const appliedExpression = renumberQueryExpression(
        expression,
        completeRules.map(({ id }) => id),
      );
      expressionFilter = encodeAdvancedRules(appliedExpression.text, completeRules);
    } catch (failure) {
      if (!(failure instanceof Error)) throw failure;
      logicError = failure.message;
    }
  }
  const renderExpressionSegment = (text: string, offset = 0) => {
    const references = deletedRuleReferences
      .filter(({ start, end }) => start >= offset && end <= offset + text.length)
      .map(({ number, start, end }) => ({ number, start: start - offset, end: end - offset }));
    return renderHighlightedExpression(text, references);
  };
  const expressionSummary = (currentExpression || expressionChanged) && (
    <fieldset
      aria-describedby={expressionChanged ? expressionStatusId : undefined}
      className="recipe-filter-expression"
    >
      <legend className="visually-hidden">Advanced rule expression</legend>
      <i>
        {!currentExpression ? (
          <mark>Advanced rule removed</mark>
        ) : expressionChange ? (
          <>
            {renderExpressionSegment(expressionChange.before)}
            {expressionChange.changed ? (
              <mark>
                {renderExpressionSegment(expressionChange.changed, expressionChange.before.length)}
              </mark>
            ) : (
              expressionChange.removed && <mark aria-hidden="true">−</mark>
            )}
            {renderExpressionSegment(
              expressionChange.after,
              currentExpression.length - expressionChange.after.length,
            )}
          </>
        ) : (
          renderExpressionSegment(currentExpression)
        )}
      </i>
      {currentExpression && (
        <button
          aria-label="Remove advanced rule"
          onClick={() => {
            setExpression(null);
            setInitialError('');
            setInvalidText('');
            advancedLinkRef.current?.focus();
          }}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      )}
      {expressionChanged && (
        <span className="visually-hidden" id={expressionStatusId}>
          {currentExpression
            ? expressionChange?.removed
              ? 'Advanced rule expression changed, not yet applied. Removed text is marked.'
              : 'Advanced rule expression changed, not yet applied.'
            : 'Advanced rule expression removed, not yet applied.'}
        </span>
      )}
    </fieldset>
  );

  return (
    <fieldset className="recipe-filter-builder" disabled={mode !== 'query'} ref={builderRef}>
      <legend>{title}</legend>
      {ruleEntries.map((entry) => {
        if (entry.kind === 'deleted') {
          const deletionStatusId = `${entry.id}-deletion-status`;
          return (
            <fieldset
              aria-describedby={deletionStatusId}
              className="recipe-filter-deleted-row"
              data-deleted-rule-id={entry.id}
              key={`deleted-${entry.id}`}
            >
              <legend className="visually-hidden">Rule {entry.number}</legend>
              <span aria-hidden="true" className="recipe-filter-rule-number">
                {entry.number}.
              </span>
              <span
                aria-hidden="true"
                className="recipe-filter-mobile-toggle recipe-filter-deleted-mobile-toggle"
              >
                <span>{entry.number}</span>
                <ChevronRight aria-hidden="true" className="recipe-filter-mobile-caret" size={14} />
              </span>
              {hasSubmittedQuery ? (
                <mark className="recipe-filter-deleted-label">Rule deleted</mark>
              ) : (
                <span className="recipe-filter-deleted-label">Rule deleted</span>
              )}
              <span className="visually-hidden" id={deletionStatusId}>
                Rule {entry.number} was deleted and is not yet applied. Update Advanced Rules if the
                expression references it.
              </span>
            </fieldset>
          );
        }
        const { draft, number } = entry;
        const appliedDraft = appliedDrafts.get(draft.id);
        const stagedStatusId = `${draft.id}-staged-status`;
        const fieldChanged =
          hasSubmittedQuery && (!appliedDraft || appliedDraft.field !== draft.field);
        const operatorChanged =
          hasSubmittedQuery && (!appliedDraft || appliedDraft.operator !== draft.operator);
        const valueChanged =
          hasSubmittedQuery && (!appliedDraft || !sameDraftValue(appliedDraft.value, draft.value));
        const valueToChanged =
          hasSubmittedQuery && (!appliedDraft || appliedDraft.valueTo !== draft.valueTo);
        const draftChanged = fieldChanged || operatorChanged || valueChanged || valueToChanged;
        const definition = definitionFor(draft.field);
        const kind = definition?.kind;
        const isNumberValue = kind === 'number';
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
        const selectedOperatorLabel =
          availableOperators.find(({ value }) => value === draft.operator)?.label ?? '—';
        const compactOperatorLabel =
          compactOperatorLabels[`${kind}:${draft.operator}`] ?? selectedOperatorLabel;
        const fieldControlId = `${draft.id}-field`;
        const operatorControlId = `${draft.id}-operator`;
        const valueControlId = `${draft.id}-value`;
        const valueToControlId = `${draft.id}-value-to`;
        const isMobileExpanded = expandedRuleIds.has(draft.id);
        const inputValue = Array.isArray(draft.value) ? '' : draft.value;
        const expandedInputWidth = (value: string) =>
          `calc(${Math.max(kind === 'date' ? 10 : kind === 'number' ? 4 : 1, value.length)}ch + 24px)`;
        const selectedMarkerValue = Array.isArray(draft.value)
          ? (draft.value[0] ?? '')
          : draft.value;
        return (
          <fieldset
            aria-label={`Filter ${number}`}
            className={`recipe-filter-row${isNumberValue ? ' recipe-filter-number-row' : ''}${isMobileExpanded ? ' recipe-filter-row-expanded' : ''}`}
            data-mobile-expanded={isMobileExpanded}
            data-filter-rule-id={draft.id}
            key={draft.id}
          >
            <button
              aria-expanded={isMobileExpanded}
              aria-label={`${isMobileExpanded ? 'Collapse' : 'Expand'} filter ${number}`}
              className="recipe-filter-mobile-toggle"
              onClick={() => toggleRuleExpanded(draft.id)}
              type="button"
            >
              <span>{number}</span>
              <ChevronRight aria-hidden="true" className="recipe-filter-mobile-caret" size={14} />
            </button>
            <span aria-hidden="true" className="recipe-filter-rule-number">
              {number}.
            </span>
            <div className="recipe-filter-controls">
              <label className="visually-hidden recipe-filter-field-label" htmlFor={fieldControlId}>
                Field
              </label>
              <Picklist
                className={`recipe-picklist-trigger recipe-filter-field-control${fieldChanged ? ' is-staged-changed' : ''}`}
                describedBy={fieldChanged ? stagedStatusId : undefined}
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
                className={`recipe-picklist-trigger recipe-filter-operator-control${operatorChanged ? ' is-staged-changed' : ''}`}
                describedBy={operatorChanged ? stagedStatusId : undefined}
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
                showArrow={false}
                sizeToContent={false}
                title={selectedOperatorLabel}
                value={draft.operator}
              >
                <span className="recipe-filter-picklist-label">{compactOperatorLabel}</span>
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
                      describedBy={valueChanged ? stagedStatusId : undefined}
                      emptyLabel="Select"
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
                      stagedChange={valueChanged}
                      selectedIds={Array.isArray(draft.value) ? draft.value : []}
                      values={valueOptions.map(({ value, label }) => ({
                        id: value,
                        display_value: label,
                      }))}
                    />
                  ) : kind === 'marker' ? (
                    <Picklist
                      className={`recipe-picklist-trigger recipe-filter-value-trigger${valueChanged ? ' is-staged-changed' : ''}`}
                      describedBy={valueChanged ? stagedStatusId : undefined}
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
                      aria-describedby={valueChanged ? stagedStatusId : undefined}
                      className={`recipe-filter-value-control${isNumberValue ? ' recipe-filter-number-value-control' : ''}${valueChanged ? ' is-staged-changed' : ''}`}
                      disabled={!kind}
                      id={valueControlId}
                      maxLength={kind === 'text' ? 500 : undefined}
                      min={draft.field === 'score' ? -5 : kind === 'number' ? 0 : undefined}
                      max={draft.field === 'score' ? 5 : undefined}
                      required={Boolean(kind)}
                      step={
                        draft.field === 'serves' || standardNutrientFilterFields.has(draft.field)
                          ? 'any'
                          : kind === 'number'
                            ? 1
                            : undefined
                      }
                      type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
                      style={
                        isMobileExpanded ? { width: expandedInputWidth(inputValue) } : undefined
                      }
                      value={inputValue}
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
                        aria-describedby={valueToChanged ? stagedStatusId : undefined}
                        className={`recipe-filter-value-to-control${isNumberValue ? ' recipe-filter-number-value-to-control' : ''}${valueToChanged ? ' is-staged-changed' : ''}`}
                        id={valueToControlId}
                        min={draft.field === 'score' ? -5 : kind === 'number' ? 0 : undefined}
                        max={draft.field === 'score' ? 5 : undefined}
                        required
                        style={
                          isMobileExpanded
                            ? { width: expandedInputWidth(draft.valueTo) }
                            : undefined
                        }
                        step={draft.field === 'serves' ? 'any' : kind === 'number' ? 1 : undefined}
                        type={kind === 'number' ? 'number' : 'date'}
                        value={draft.valueTo}
                        onChange={(event) => updateDraft(draft.id, { valueTo: event.target.value })}
                      />
                    </>
                  )}
                </>
              )}
            </div>

            {draftChanged && (
              <span className="visually-hidden" id={stagedStatusId}>
                Changed, not yet applied.
              </span>
            )}
            {normalizedFilter && !expression && (
              <input name="filter" type="hidden" value={JSON.stringify(normalizedFilter)} />
            )}
            <button
              aria-label={`Remove filter ${number}`}
              className="recipe-filter-remove recipe-ingredient-delete-button"
              onClick={() => removeRule(draft.id)}
              title={`Remove filter ${number}`}
              type="button"
            >
              <X aria-hidden="true" size={30} strokeWidth={1.35} />
            </button>
          </fieldset>
        );
      })}
      {expressionFilter && (
        <input name="filter" type="hidden" value={JSON.stringify(expressionFilter)} />
      )}
      {showAutoSelectColumns && <input name="auto_select_columns" type="hidden" value="1" />}
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
          <div className="recipe-filter-button-row">
            {drafts.length > 0 && (
              <button className="recipe-filter-clear-all" onClick={clearRules} type="button">
                <span className="recipe-ingredient-empty-prompt">clear all</span>
              </button>
            )}
            <button
              aria-describedby={logicError ? logicErrorId : undefined}
              className="recipe-filter-apply"
              disabled={!drafts.every(isCompleteDraft) || Boolean(logicError)}
              type="submit"
            >
              apply
            </button>
          </div>
        </div>
      </div>
      <div className="recipe-filter-advanced-row">
        <div className="recipe-filter-advanced-controls">
          <div className="recipe-filter-expression-desktop">{expressionSummary}</div>
          <button
            className="recipe-filter-advanced-link"
            onClick={() => setIsAdvancedOpen(true)}
            ref={advancedLinkRef}
            type="button"
          >
            <span>Advanced Rules</span>
          </button>
        </div>
        {logicError && (
          <p className="recipe-advanced-rules-error" id={logicErrorId} role="alert">
            {logicError}
          </p>
        )}
        {showAutoSelectColumns && (
          <label className="recipe-filter-auto-select">
            <span className="recipe-filter-auto-label-desktop">Don't auto-select columns</span>
            <span className="recipe-filter-auto-label-mobile">Don't add cols.</span>
            <input
              checked={disableColumnAutoSelect}
              name="no_auto_select_columns"
              onChange={(event) => setDisableColumnAutoSelect(event.currentTarget.checked)}
              type="checkbox"
              value="1"
            />
          </label>
        )}
      </div>
      {isAdvancedOpen && (
        <AdvancedRulesPane
          deletedRules={deletedRules}
          expression={expression?.text ?? invalidText}
          highlightDeleted={hasSubmittedQuery}
          ruleSlots={ruleSlots}
          validationError={logicError}
          onAdd={(next) => {
            if (next && completeRules.length === drafts.length) {
              encodeAdvancedRules(
                renumberQueryExpression(
                  next,
                  completeRules.map(({ id }) => id),
                ).text,
                completeRules,
              );
            }
            setExpression(next);
            setInitialError('');
            setInvalidText('');
            setIsAdvancedOpen(false);
          }}
          onCancel={() => setIsAdvancedOpen(false)}
          rules={numberedDrafts.map(({ draft, number }) => {
            const definition = definitionFor(draft.field);
            const value = Array.isArray(draft.value)
              ? draft.value
                  .map(
                    (item) =>
                      optionsFor(draft.field, options).find(({ value: option }) => option === item)
                        ?.label ?? item,
                  )
                  .join(', ')
              : draft.value;
            const operator = definition
              ? (operators[definition.kind].find(({ value: option }) => option === draft.operator)
                  ?.label ?? draft.operator)
              : '';
            return {
              id: draft.id,
              number,
              description: `${definition?.label ?? 'Choose field'} ${operator} ${value}${draft.valueTo ? ` through ${draft.valueTo}` : ''}`,
            };
          })}
        />
      )}
    </fieldset>
  );
}
