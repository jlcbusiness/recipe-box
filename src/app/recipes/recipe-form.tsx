'use client';

import {
  type FocusEvent,
  type KeyboardEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RecipePicklistValue, RecipeRecord, RecipeState } from '../../lib/recipes/data';
import {
  calculateTotalMinutes,
  clearConditionalValuesForStateChange,
  shouldShowOccasionDetails,
} from '../../lib/recipes/recipe-rules';
import { saveRecipe } from './actions';

type RecipeFormProps = {
  picklists: RecipePicklistValue[];
  recipe?: RecipeRecord;
};

type RecipeMultiSelectCategory = 'meal_type' | 'cuisine' | 'equipment';
type RecipeSinglePicklistCategory = 'food_type' | 'state' | 'verdict' | 'enthusiasm';
type RecipePicklistKey = RecipeMultiSelectCategory | RecipeSinglePicklistCategory;

type SinglePicklistOption = {
  value: string;
  label: string;
};

const timeFields = [
  ['prep_time_minutes', 'Prep time (minutes)', 'Prep'],
  ['mixing_time_minutes', 'Mixing time (minutes)', 'Mixing'],
  ['marinate_time_minutes', 'Marinate time (minutes)', 'Marinate'],
  ['chill_time_minutes', 'Chill time (minutes)', 'Chill'],
  ['freeze_time_minutes', 'Freeze time (minutes)', 'Freeze'],
  ['cook_time_minutes', 'Cook time (minutes)', 'Cook'],
  ['bake_time_minutes', 'Bake time (minutes)', 'Bake'],
  ['cooling_time_minutes', 'Cooling time (minutes)', 'Cooling'],
  ['rest_time_minutes', 'Rest time (minutes)', 'Rest'],
] as const;

const stateOptions: SinglePicklistOption[] = [
  { value: 'want_to_try', label: 'Want to Try' },
  { value: 'tried', label: 'Tried' },
  { value: 'will_not_try', label: 'Will not try' },
];

function SinglePicklist({
  label,
  name,
  value,
  placeholder,
  options,
  isOpen,
  onToggle,
  onClose,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  options: SinglePicklistOption[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(0);
  const selectedOption = options.find((option) => option.value === value);
  const longestOption = options.reduce(
    (longest, option) => (option.label.length > longest.length ? option.label : longest),
    placeholder,
  );

  useEffect(() => {
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerWidth(measuredWidth);
    }
  }, []);

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !anchorRef.current?.contains(nextTarget as Node)) {
      onClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="recipe-field recipe-single-picklist">
      <span>{label}</span>
      <div className="recipe-picklist-anchor" ref={anchorRef}>
        <span aria-hidden="true" className="recipe-picklist-measure" ref={measureRef}>
          ✓ {longestOption}
        </span>
        <button
          aria-controls={`${name}-options`}
          aria-expanded={isOpen}
          aria-label={label}
          className="recipe-picklist-trigger"
          ref={triggerRef}
          style={{ minWidth: triggerWidth ? `${triggerWidth + 40}px` : undefined }}
          type="button"
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={onToggle}
        >
          <span className="recipe-picklist-trigger-label">
            {selectedOption && (
              <span aria-hidden="true" className="recipe-picklist-trigger-check">
                ✓
              </span>
            )}
            <span>{selectedOption?.label ?? placeholder}</span>
          </span>
          <span aria-hidden="true" className="recipe-picklist-arrow">
            ▾
          </span>
        </button>
        {isOpen && (
          <fieldset
            aria-label={`${label} options`}
            className="recipe-picklist-menu"
            id={`${name}-options`}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  aria-pressed={isSelected}
                  className="recipe-picklist-option"
                  key={option.value}
                  type="button"
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  onClick={() => {
                    onChange(option.value);
                    onClose();
                  }}
                >
                  <span aria-hidden="true" className="recipe-picklist-check">
                    {isSelected ? '✓' : ''}
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </fieldset>
        )}
        <input name={name} type="hidden" value={value} />
      </div>
    </div>
  );
}

function MultiPicklist({
  category,
  label,
  values,
  selectedIds,
  isOpen,
  onToggle,
  onClose,
}: {
  category: RecipeMultiSelectCategory;
  label: string;
  values: RecipePicklistValue[];
  selectedIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [selectedOptionIds, setSelectedOptionIds] = useState(selectedIds);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [triggerLabelWidth, setTriggerLabelWidth] = useState(0);
  const selectedValues = values.filter((value) => selectedOptionIds.includes(value.id));
  const longestOption = values.reduce(
    (longest, value) => (value.value.length > longest.length ? value.value : longest),
    '',
  );
  const triggerMeasure = `✓ ${longestOption}`;
  const summaryText = selectedValues[0]?.value ?? 'Select';
  const accessibleSelection = selectedValues.map((value) => value.value).join(', ');

  useEffect(() => {
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerLabelWidth(measuredWidth);
    }
  }, []);

  function toggleOption(valueId: string) {
    setSelectedOptionIds((current) =>
      current.includes(valueId) ? current.filter((id) => id !== valueId) : [...current, valueId],
    );
  }

  return (
    <fieldset
      className="recipe-choice-group"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          onClose();
          triggerRef.current?.focus();
        }
      }}
    >
      <legend>{label}</legend>
      <div className="recipe-picklist-anchor">
        <span aria-hidden="true" className="recipe-picklist-measure" ref={measureRef}>
          {triggerMeasure}
        </span>
        <button
          aria-controls={`${category}-options`}
          aria-expanded={isOpen}
          aria-label={`${label}: ${accessibleSelection || 'Select'}`}
          className="recipe-picklist-trigger"
          ref={triggerRef}
          style={{ minWidth: triggerLabelWidth ? `${triggerLabelWidth + 40}px` : undefined }}
          type="button"
          onClick={onToggle}
        >
          <span className="recipe-picklist-trigger-label">
            {selectedValues.length > 0 && (
              <span aria-hidden="true" className="recipe-picklist-trigger-check">
                ✓
              </span>
            )}
            <span>{summaryText}</span>
          </span>
          <span aria-hidden="true" className="recipe-picklist-arrow">
            ▾
          </span>
        </button>
        {isOpen && (
          <fieldset
            aria-label={`${label} options`}
            className="recipe-picklist-menu"
            id={`${category}-options`}
          >
            {values.map((value) => {
              const isSelected = selectedOptionIds.includes(value.id);
              return (
                <button
                  aria-pressed={isSelected}
                  className="recipe-picklist-option"
                  key={value.id}
                  type="button"
                  onClick={() => toggleOption(value.id)}
                >
                  <span aria-hidden="true" className="recipe-picklist-check">
                    {isSelected ? '✓' : ''}
                  </span>
                  <span>{value.value}</span>
                </button>
              );
            })}
          </fieldset>
        )}
      </div>
      {selectedOptionIds.map((valueId) => (
        <input key={valueId} name={`${category}_ids`} type="hidden" value={valueId} />
      ))}
    </fieldset>
  );
}

export function RecipeForm({ picklists, recipe }: RecipeFormProps) {
  const [actionState, formAction, pending] = useActionState(saveRecipe, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<RecipeState>(recipe?.state ?? 'want_to_try');
  const [foodTypeId, setFoodTypeId] = useState(recipe?.food_type_id ?? '');
  const [serves, setServes] = useState<number | null>(recipe?.serves ?? null);
  const [verdictId, setVerdictId] = useState(recipe?.verdict_id ?? '');
  const [enthusiasmId, setEnthusiasmId] = useState(recipe?.enthusiasm_id ?? '');
  const [occasionDetails, setOccasionDetails] = useState(recipe?.occasion_details ?? '');
  const [reason, setReason] = useState(recipe?.reason ?? '');
  const [openPicklist, setOpenPicklist] = useState<RecipePicklistKey | null>(null);

  const valuesFor = (category: RecipePicklistValue['category']) =>
    picklists.filter((picklist) => picklist.category === category);
  const picklistValue = (id: string) => picklists.find((picklist) => picklist.id === id)?.value;
  const selectedResponse = state === 'want_to_try' ? enthusiasmId : verdictId;
  const showOccasion = shouldShowOccasionDetails(
    picklistValue(selectedResponse)?.toLowerCase().replaceAll(' ', '_') ?? null,
  );

  function togglePicklist(category: RecipePicklistKey) {
    setOpenPicklist((current) => (current === category ? null : category));
  }

  function handleStateChange(nextState: RecipeState) {
    if (state !== nextState) {
      const cleared = clearConditionalValuesForStateChange(state, nextState, {
        verdictId,
        enthusiasmId,
        occasionDetails,
        reason,
      });
      setVerdictId(cleared.verdictId ?? '');
      setEnthusiasmId(cleared.enthusiasmId ?? '');
      setOccasionDetails(cleared.occasionDetails ?? '');
      setReason(cleared.reason ?? '');
    }
    setState(nextState);
  }

  function handleSelectionChange(category: 'verdict' | 'enthusiasm', value: string) {
    if (category === 'verdict') {
      setVerdictId(value);
    } else {
      setEnthusiasmId(value);
    }
    if (picklistValue(value)?.toLowerCase() !== 'specific occasion') {
      setOccasionDetails('');
    }
  }

  function calculateTotal() {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const readMinutes = (field: string) => {
      const input = form.elements.namedItem(field);
      return input instanceof HTMLInputElement && input.value !== '' ? Number(input.value) : null;
    };
    const totalInput = form.elements.namedItem('total_time_minutes');
    if (totalInput instanceof HTMLInputElement) {
      totalInput.value = String(
        calculateTotalMinutes({
          prep: readMinutes('prep_time_minutes'),
          mixing: readMinutes('mixing_time_minutes'),
          marinate: readMinutes('marinate_time_minutes'),
          chill: readMinutes('chill_time_minutes'),
          freeze: readMinutes('freeze_time_minutes'),
          cook: readMinutes('cook_time_minutes'),
          bake: readMinutes('bake_time_minutes'),
          cooling: readMinutes('cooling_time_minutes'),
          rest: readMinutes('rest_time_minutes'),
          total: readMinutes('total_time_minutes'),
        }),
      );
    }
  }

  return (
    <form action={formAction} className="recipe-form" ref={formRef}>
      {recipe && (
        <>
          <input name="recipe_id" type="hidden" value={recipe.id} />
          <input name="expected_version" type="hidden" value={recipe.version} />
        </>
      )}
      <fieldset className="recipe-metadata-section">
        <legend>Recipe</legend>
        <label className="recipe-field recipe-field-wide" htmlFor="recipe-name">
          <span>Name</span>
          <input
            id="recipe-name"
            autoComplete="off"
            name="name"
            required
            defaultValue={recipe?.name ?? ''}
          />
        </label>
        <div className="recipe-form-fields recipe-state-fields">
          <SinglePicklist
            label="State"
            name="state"
            value={state}
            placeholder="Select"
            options={stateOptions}
            isOpen={openPicklist === 'state'}
            onToggle={() => togglePicklist('state')}
            onClose={() => setOpenPicklist(null)}
            onChange={(value) => handleStateChange(value as RecipeState)}
          />
          {state === 'want_to_try' && (
            <SinglePicklist
              label="Enthusiasm"
              name="enthusiasm_id"
              value={enthusiasmId}
              placeholder="What am I feeling?"
              options={valuesFor('enthusiasm').map((value) => ({
                value: value.id,
                label: value.value,
              }))}
              isOpen={openPicklist === 'enthusiasm'}
              onToggle={() => togglePicklist('enthusiasm')}
              onClose={() => setOpenPicklist(null)}
              onChange={(value) => handleSelectionChange('enthusiasm', value)}
            />
          )}
          {state === 'tried' && (
            <SinglePicklist
              label="Verdict"
              name="verdict_id"
              value={verdictId}
              placeholder="Select Verdict"
              options={valuesFor('verdict').map((value) => ({
                value: value.id,
                label: value.value,
              }))}
              isOpen={openPicklist === 'verdict'}
              onToggle={() => togglePicklist('verdict')}
              onClose={() => setOpenPicklist(null)}
              onChange={(value) => handleSelectionChange('verdict', value)}
            />
          )}
          {state === 'will_not_try' && (
            <label className="recipe-field" htmlFor="reason">
              <span>Reason</span>
              <input
                id="reason"
                name="reason"
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}
          {showOccasion && (
            <label className="recipe-field" htmlFor="occasion-details">
              <span>Occasion Details</span>
              <textarea
                id="occasion-details"
                name="occasion_details"
                rows={3}
                value={occasionDetails}
                onChange={(event) => setOccasionDetails(event.target.value)}
              />
            </label>
          )}
          <label className="recipe-field" htmlFor="serves">
            <span>Serves</span>
            <input
              id="serves"
              min="1"
              name="serves"
              step="1"
              type="number"
              value={serves ?? ''}
              onChange={(event) =>
                setServes(event.target.value === '' ? null : Number(event.target.value))
              }
            />
          </label>
          <MultiPicklist
            category="equipment"
            label="Equipment"
            values={valuesFor('equipment')}
            selectedIds={recipe?.equipment_ids ?? []}
            isOpen={openPicklist === 'equipment'}
            onToggle={() => togglePicklist('equipment')}
            onClose={() => setOpenPicklist(null)}
          />
        </div>
        <div className="recipe-form-fields recipe-classification-fields">
          <SinglePicklist
            label="Food Type"
            name="food_type_id"
            value={foodTypeId}
            placeholder="Select Food Type"
            options={valuesFor('food_type').map((value) => ({
              value: value.id,
              label: value.value,
            }))}
            isOpen={openPicklist === 'food_type'}
            onToggle={() => togglePicklist('food_type')}
            onClose={() => setOpenPicklist(null)}
            onChange={setFoodTypeId}
          />
          <MultiPicklist
            category="meal_type"
            label="Meal Type"
            values={valuesFor('meal_type')}
            selectedIds={recipe?.meal_type_ids ?? []}
            isOpen={openPicklist === 'meal_type'}
            onToggle={() => togglePicklist('meal_type')}
            onClose={() => setOpenPicklist(null)}
          />
          <MultiPicklist
            category="cuisine"
            label="Cuisine"
            values={valuesFor('cuisine')}
            selectedIds={recipe?.cuisine_ids ?? []}
            isOpen={openPicklist === 'cuisine'}
            onToggle={() => togglePicklist('cuisine')}
            onClose={() => setOpenPicklist(null)}
          />
        </div>
      </fieldset>
      <fieldset className="recipe-time-fieldset">
        <legend>Times (min)</legend>
        <div className="recipe-time-fields">
          {timeFields.map(([name, accessibleLabel, shortLabel]) => (
            <label className="recipe-time-field" htmlFor={name} key={name}>
              <span>{shortLabel}</span>
              <input
                aria-label={accessibleLabel}
                id={name}
                name={name}
                type="number"
                min="0"
                step="1"
                defaultValue={recipe?.[name] ?? ''}
              />
            </label>
          ))}
        </div>
        <div className="recipe-time-total-row">
          <label className="recipe-time-field" htmlFor="total-time">
            <span>Total</span>
            <input
              aria-label="Total time (minutes)"
              id="total-time"
              name="total_time_minutes"
              type="number"
              min="0"
              step="1"
              defaultValue={recipe?.total_time_minutes ?? ''}
            />
          </label>
          <button
            aria-label="Calculate total time"
            className="recipe-secondary-button recipe-calculate-button"
            title="Calculate total time"
            type="button"
            onClick={calculateTotal}
          >
            <span aria-hidden="true" className="recipe-calculate-icon">
              Σ
            </span>
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Notes</legend>
        <label className="recipe-field recipe-field-wide" htmlFor="notes-markdown">
          <span>Notes (Markdown)</span>
          <textarea
            id="notes-markdown"
            name="notes_markdown"
            rows={6}
            defaultValue={recipe?.notes_markdown ?? ''}
          />
        </label>
      </fieldset>
      {actionState?.error && (
        <p className="recipe-form-error" role="alert">
          {actionState.error}
        </p>
      )}
      <div className="recipe-form-actions">
        <a className="recipe-secondary-link" href={recipe ? `/recipes/${recipe.id}` : '/recipes'}>
          Cancel
        </a>
        <button className="recipe-primary-button" disabled={pending} type="submit">
          {pending ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </form>
  );
}
