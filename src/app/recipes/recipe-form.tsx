'use client';

import { type FormEvent, useActionState, useEffect, useRef, useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import type {
  IngredientOption,
  PublicationOption,
  RecipePicklistValue,
  RecipeRecord,
  RecipeReference,
  RecipeState,
  TagOption,
} from '../../lib/recipes/data';
import type { IngredientRowDraft } from '../../lib/recipes/ingredient-rules';
import { isEmptyIngredientRow, serializeIngredientRows } from '../../lib/recipes/ingredient-rules';
import {
  type InstructionStepDraft,
  instructionPlainText,
  parseIngredientMentions,
  serializeInstructionSteps,
  unlinkIngredientMentions,
} from '../../lib/recipes/instruction-rules';
import { formatQuantityRange } from '../../lib/recipes/measurement-rules';
import {
  calculateTotalMinutes,
  clearConditionalValuesForStateChange,
  shouldShowOccasionDetails,
} from '../../lib/recipes/recipe-rules';
import { MediaManager } from '../media/media-manager';
import { Picklist } from '../picklist';
import { TagMultiSelect } from '../tags/tag-controls';
import { saveRecipe } from './actions';
import { IngredientRowsEditor } from './ingredient-rows-editor';
import { InstructionStepsEditor } from './instruction-steps-editor';
import { MultiPicklist, type RecipeMultiSelectCategory } from './multi-picklist';
import { PublicationPicker } from './publication-picker';
import { RecipeRelationshipsEditor } from './recipe-relationships-editor';

type RecipeFormProps = {
  ingredients: IngredientOption[];
  initialPublicationId?: string | null;
  mediaAssets?: MediaAssetDisplay[];
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  publications: PublicationOption[];
  recipeOptions: IngredientOption[];
  tags: TagOption[];
  recipe?: RecipeRecord;
};

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
  onOpenChange,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
  options: SinglePicklistOption[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="recipe-field recipe-single-picklist">
      <span>{label}</span>
      <Picklist
        className="recipe-picklist-trigger"
        label={label}
        measureLabel={placeholder}
        menuClassName="recipe-picklist-menu"
        onOpenChange={onOpenChange}
        onSelect={onChange}
        open={isOpen}
        options={options}
        value={value}
      >
        <span className="recipe-picklist-trigger-label">
          {selectedOption && (
            <span aria-hidden="true" className="single-picklist-check">
              ✓
            </span>
          )}
          <span>{selectedOption?.label ?? placeholder}</span>
        </span>
      </Picklist>
      <input name={name} type="hidden" value={value} />
    </div>
  );
}

function RecipeNameField({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);

  return (
    <label className="recipe-field recipe-field-wide recipe-name-field" htmlFor="recipe-name">
      <span>Name</span>
      <input
        id="recipe-name"
        autoComplete="off"
        name="name"
        required
        size={Math.max(1, name.length)}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </label>
  );
}

export function RecipeForm({
  ingredients,
  initialPublicationId,
  mediaAssets = [],
  picklists,
  preparationOptions,
  publications,
  recipeOptions,
  tags,
  recipe,
}: RecipeFormProps) {
  const [actionState, formAction, pending] = useActionState(saveRecipe, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [ingredientRows, setIngredientRows] = useState<IngredientRowDraft[]>(
    () =>
      recipe?.ingredients.map((row) => ({
        id: row.id,
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        isMain: row.is_main,
        detail: row.detail,
        preparation: row.preparation,
        measurements: row.measurements.map((measurement) => ({
          id: measurement.id,
          type: measurement.measurement_type,
          quantity:
            measurement.amount_min === null
              ? ''
              : formatQuantityRange(measurement.amount_min, measurement.amount_max),
          unitCode: measurement.unit_code ?? '',
          picklistValueId: measurement.picklist_value_id ?? '',
        })),
      })) ?? [],
  );
  const [ingredientRowsError, setIngredientRowsError] = useState('');
  const [instructionSteps, setInstructionSteps] = useState<InstructionStepDraft[]>(
    () =>
      recipe?.steps.map((step) => ({
        id: step.id,
        markdown: step.content_markdown,
        plainText: step.plain_text,
      })) ?? [{ id: 'instruction-draft', markdown: '', plainText: '' }],
  );
  const [instructionStepsError, setInstructionStepsError] = useState('');
  const [pendingIngredientDeletion, setPendingIngredientDeletion] =
    useState<IngredientRowDraft | null>(null);
  const ingredientDeletionDialogRef = useRef<HTMLDialogElement>(null);
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

  useEffect(() => {
    const dialog = ingredientDeletionDialogRef.current;
    if (!dialog) {
      return;
    }
    if (pendingIngredientDeletion && !dialog.open) {
      dialog.showModal();
    } else if (!pendingIngredientDeletion && dialog.open) {
      dialog.close();
    }
  }, [pendingIngredientDeletion]);

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

  function addInstructionIngredient(name: string, ingredientId: string | null) {
    const ingredient = {
      id: crypto.randomUUID(),
      name: name.trim(),
    };
    const ingredientRow: IngredientRowDraft = {
      id: ingredient.id,
      ingredientId,
      ingredientName: ingredient.name,
      isMain: false,
      detail: '',
      preparation: '',
      measurements: [],
    };
    setIngredientRows((currentRows) => [
      ...currentRows.filter((row) => !isEmptyIngredientRow(row)),
      ingredientRow,
      ...currentRows.filter(isEmptyIngredientRow).slice(0, 1),
    ]);
    return ingredient;
  }

  function requestIngredientDeletion(row: IngredientRowDraft) {
    const isMentioned = instructionSteps.some((step) =>
      parseIngredientMentions(step.markdown).some(
        (mention) => mention.recipeIngredientId === row.id.toLocaleLowerCase(),
      ),
    );
    if (isMentioned) {
      setPendingIngredientDeletion(row);
      return;
    }
    setIngredientRows((currentRows) => currentRows.filter((current) => current.id !== row.id));
  }

  function confirmIngredientDeletion() {
    const row = pendingIngredientDeletion;
    if (!row) {
      return;
    }
    ingredientDeletionDialogRef.current?.close();
    setInstructionSteps((currentSteps) =>
      currentSteps.map((step) => ({
        ...step,
        markdown: unlinkIngredientMentions(step.markdown, row.id, row.ingredientName),
      })),
    );
    setIngredientRows((currentRows) => currentRows.filter((current) => current.id !== row.id));
    setPendingIngredientDeletion(null);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    let ingredientPayload: ReturnType<typeof serializeIngredientRows>;
    try {
      ingredientPayload = serializeIngredientRows(ingredientRows);
    } catch (error) {
      event.preventDefault();
      setIngredientRowsError(
        error instanceof Error ? error.message : 'Check the ingredient rows before saving.',
      );
      return;
    }

    let instructionPayload: ReturnType<typeof serializeInstructionSteps>;
    try {
      instructionPayload = serializeInstructionSteps(
        instructionSteps.map((step) => ({
          ...step,
          id: step.id === 'instruction-draft' ? crypto.randomUUID() : step.id,
          plainText: instructionPlainText(step.markdown),
        })),
        ingredientRows.map((row) => row.id),
      );
    } catch (error) {
      event.preventDefault();
      setInstructionStepsError(
        error instanceof Error ? error.message : 'Check the instruction steps before saving.',
      );
      return;
    }

    const ingredientInput = event.currentTarget.elements.namedItem('ingredient_rows');
    const instructionInput = event.currentTarget.elements.namedItem('instruction_steps');
    if (ingredientInput instanceof HTMLInputElement) {
      ingredientInput.value = JSON.stringify(ingredientPayload);
    }
    if (instructionInput instanceof HTMLInputElement) {
      instructionInput.value = JSON.stringify(instructionPayload);
    }
    setIngredientRowsError('');
    setInstructionStepsError('');
  }

  return (
    <form action={formAction} className="recipe-form" onSubmit={handleSubmit} ref={formRef}>
      <input name="ingredient_rows" type="hidden" defaultValue="[]" />
      <input name="instruction_steps" type="hidden" defaultValue="[]" />
      {recipe && (
        <>
          <input name="recipe_id" type="hidden" value={recipe.id} />
          <input name="expected_version" type="hidden" value={recipe.version} />
        </>
      )}
      <fieldset className="recipe-metadata-section">
        <legend>Recipe</legend>
        <div className="recipe-name-media-row">
          <RecipeNameField initialName={recipe?.name ?? ''} />
          {recipe && (
            <MediaManager
              assets={mediaAssets}
              parentId={recipe.id}
              parentName={recipe.name}
              parentType="recipe"
            />
          )}
        </div>
        <PublicationPicker
          initialPage={recipe?.publication_page ?? null}
          initialPublicationId={recipe?.publication_id ?? initialPublicationId ?? null}
          initialUrl={recipe?.recipe_url ?? null}
          publications={publications}
          tags={tags}
        />
        <div className="recipe-form-fields recipe-state-fields">
          <SinglePicklist
            label="State"
            name="state"
            value={state}
            placeholder="Select"
            options={stateOptions}
            isOpen={openPicklist === 'state'}
            onOpenChange={(isOpen) => setOpenPicklist(isOpen ? 'state' : null)}
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
                label: value.display_value,
              }))}
              isOpen={openPicklist === 'enthusiasm'}
              onOpenChange={(isOpen) => setOpenPicklist(isOpen ? 'enthusiasm' : null)}
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
                label: value.display_value,
              }))}
              isOpen={openPicklist === 'verdict'}
              onOpenChange={(isOpen) => setOpenPicklist(isOpen ? 'verdict' : null)}
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
              <input
                id="occasion-details"
                name="occasion_details"
                type="text"
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
              label: value.display_value,
            }))}
            isOpen={openPicklist === 'food_type'}
            onOpenChange={(isOpen) => setOpenPicklist(isOpen ? 'food_type' : null)}
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
        <TagMultiSelect tags={tags} selectedIds={recipe?.tags.map((tag) => tag.id)} />
      </fieldset>
      <fieldset className="recipe-ingredient-section">
        <legend>Ingredients</legend>
        <IngredientRowsEditor
          ingredients={ingredients}
          picklists={picklists}
          preparationOptions={preparationOptions}
          rows={ingredientRows}
          validateMeasurements={Boolean(ingredientRowsError)}
          onDeleteRequested={requestIngredientDeletion}
          onRowsChange={setIngredientRows}
        />
        {ingredientRowsError && (
          <p className="recipe-form-error" role="alert">
            {ingredientRowsError}
          </p>
        )}
      </fieldset>
      <fieldset className="recipe-instruction-section">
        <legend>Instructions</legend>
        <InstructionStepsEditor
          ingredients={ingredientRows
            .filter((row) => row.ingredientName.trim())
            .map((row) => ({ id: row.id, name: row.ingredientName }))}
          availableIngredients={ingredients}
          steps={instructionSteps}
          onChange={setInstructionSteps}
          onAddIngredient={addInstructionIngredient}
        />
        {instructionStepsError && (
          <p className="recipe-form-error" role="alert">
            {instructionStepsError}
          </p>
        )}
      </fieldset>
      {pendingIngredientDeletion && (
        <dialog
          aria-describedby="mentioned-ingredient-delete-description"
          aria-labelledby="mentioned-ingredient-delete-title"
          className="recipe-confirmation-dialog"
          ref={ingredientDeletionDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            event.currentTarget.close();
            setPendingIngredientDeletion(null);
          }}
        >
          <h2 id="mentioned-ingredient-delete-title">Remove ingredient?</h2>
          <p id="mentioned-ingredient-delete-description">
            Removing {pendingIngredientDeletion.ingredientName} will turn its instruction links into
            ordinary # text.
          </p>
          <div className="recipe-confirmation-actions">
            <button
              type="button"
              onClick={() => {
                ingredientDeletionDialogRef.current?.close();
                setPendingIngredientDeletion(null);
              }}
            >
              Cancel
            </button>
            <button type="button" onClick={confirmIngredientDeletion}>
              Remove ingredient
            </button>
          </div>
        </dialog>
      )}
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
      <RecipeRelationshipsEditor
        pairings={recipe?.pairings ?? []}
        recipeOptions={recipeOptions}
        references={(recipe?.references ?? []) as RecipeReference[]}
      >
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
      </RecipeRelationshipsEditor>
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
