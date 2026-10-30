'use client';

import { useRouter } from 'next/navigation';
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
import {
  getPortionDisplayAmounts,
  getPortionRatio,
  isEmptyIngredientRow,
  serializeIngredientRows,
} from '../../lib/recipes/ingredient-rules';
import {
  type IngredientSetDraft,
  normalizeIngredientSets,
} from '../../lib/recipes/ingredient-set-rules';
import {
  buildIngredientMentionOptions,
  type InstructionStepDraft,
  ingredientSlug,
  instructionPlainText,
  parseIngredientMentions,
  parseInstructionPhotoReferences,
  serializeInstructionSteps,
  unlinkIngredientMentions,
  unlinkInstructionPhoto,
} from '../../lib/recipes/instruction-rules';
import {
  formatGroupedInteger,
  formatGroupedIntegerInput,
  formatQuantityInput,
  parseGroupedInteger,
  parseQuantityInput,
  serializeMeasurements,
} from '../../lib/recipes/measurement-rules';
import {
  calculateTotalMinutes,
  clearConditionalValuesForStateChange,
  recipeScoreValues,
  shouldShowOccasionDetails,
} from '../../lib/recipes/recipe-rules';
import { createUuid } from '../../lib/uuid';
import {
  createOrGetRecipePicklistValue,
  type EditorPicklistCategory,
} from '../actions/recipe-picklists';
import { MediaManager } from '../media/media-manager';
import { RecipePhotoDraftPicker } from '../media/recipe-photo-draft-picker';
import { uploadMediaFiles } from '../media/upload-files';
import { Picklist } from '../picklist';
import { TagMultiSelect } from '../tags/tag-controls';
import { saveRecipe } from './actions';
import { IngredientRowsEditor } from './ingredient-rows-editor';
import { InstructionStepsEditor } from './instruction-steps-editor';
import { MultiPicklist, type RecipeMultiSelectCategory } from './multi-picklist';
import { PublicationPicker } from './publication-picker';
import { RecipeDeleteAction } from './recipe-detail-actions';
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

type RecipeSinglePicklistCategory = 'food_type' | 'state' | 'verdict' | 'enthusiasm' | 'score';
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

function formatOptionalInteger(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : formatGroupedInteger(value);
}

function SinglePicklist({
  label,
  name,
  menuClassName = 'recipe-picklist-menu',
  value,
  placeholder,
  options,
  isOpen,
  onOpenChange,
  onChange,
  onAddOption,
}: {
  label: string;
  name: string;
  menuClassName?: string;
  value: string;
  placeholder: string;
  options: SinglePicklistOption[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (value: string) => void;
  onAddOption?: (value: string) => Promise<{ valueId?: string; error?: string }>;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="recipe-field recipe-single-picklist">
      <span>{label}</span>
      <Picklist
        className="recipe-picklist-trigger"
        label={label}
        measureLabel={placeholder}
        menuClassName={menuClassName}
        onAddOption={onAddOption}
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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handledCreatedRecipeIdRef = useRef<string | null>(null);
  const [draftPhotoFiles, setDraftPhotoFiles] = useState<File[]>([]);
  const [uploadingDraftPhotos, setUploadingDraftPhotos] = useState(false);
  const [draftPhotoUploadError, setDraftPhotoUploadError] = useState('');
  const [ingredientSets, setIngredientSets] = useState<IngredientSetDraft[]>(() =>
    recipe?.ingredient_sets.length
      ? recipe.ingredient_sets.map((set) => ({ ...set }))
      : [{ id: 'draft-main', label: 'Main', position: 0 }],
  );
  const [ingredientRows, setIngredientRows] = useState<IngredientRowDraft[]>(
    () =>
      recipe?.ingredients.map((row) => ({
        id: row.id,
        ingredientSetId: row.ingredient_set_id,
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredient_name,
        isMain: row.is_main,
        detail: row.detail,
        preparation: row.preparation,
        portionOneRatio: row.portion_one_ratio,
        sizeValue: row.size_value == null ? '' : String(row.size_value),
        sizeUnit: row.size_unit ?? '',
        measurements: row.measurements.map((measurement) => ({
          id: measurement.id,
          type: measurement.measurement_type,
          quantity:
            measurement.amount_min === null
              ? ''
              : formatQuantityInput(
                  `${measurement.amount_min}${measurement.amount_max === null ? '' : `-${measurement.amount_max}`}`,
                ),
          unitCode: measurement.unit_code ?? '',
          picklistValueId: measurement.picklist_value_id ?? '',
        })),
      })) ?? [],
  );
  const [ingredientRowsError, setIngredientRowsError] = useState('');
  const [ingredientSetsError, setIngredientSetsError] = useState('');
  const [instructionSteps, setInstructionSteps] = useState<InstructionStepDraft[]>(
    () =>
      recipe?.steps.map((step) => ({
        id: step.id,
        markdown: step.content_markdown,
        plainText: step.plain_text,
      })) ?? [{ id: 'instruction-draft', markdown: '', plainText: '' }],
  );
  const [instructionStepsError, setInstructionStepsError] = useState('');
  const photoReferenceStepNumbers: Record<string, number[]> = {};
  const addPhotoReferenceSteps = (steps: readonly { markdown: string }[]) => {
    for (const [index, step] of steps.entries()) {
      try {
        for (const assetId of parseInstructionPhotoReferences(step.markdown)) {
          const numbers = photoReferenceStepNumbers[assetId] ?? [];
          if (!numbers.includes(index + 1)) {
            photoReferenceStepNumbers[assetId] = [...numbers, index + 1];
          }
        }
      } catch {}
    }
  };
  addPhotoReferenceSteps(recipe?.steps.map((step) => ({ markdown: step.content_markdown })) ?? []);
  addPhotoReferenceSteps(instructionSteps);
  const [pendingIngredientDeletion, setPendingIngredientDeletion] =
    useState<IngredientRowDraft | null>(null);
  const ingredientDeletionDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingIngredientSetRemoval, setPendingIngredientSetRemoval] = useState<{
    set: IngredientSetDraft;
    rows: IngredientRowDraft[];
  } | null>(null);
  const [ingredientSetRemovalMode, setIngredientSetRemovalMode] = useState<'delete' | 'move' | ''>(
    '',
  );
  const [ingredientSetRemovalTargetId, setIngredientSetRemovalTargetId] = useState('');
  const ingredientSetRemovalDialogRef = useRef<HTMLDialogElement>(null);
  const [availablePicklists, setAvailablePicklists] = useState(picklists);
  const [state, setState] = useState<RecipeState>(recipe?.state ?? 'want_to_try');
  const [foodTypeId, setFoodTypeId] = useState(recipe?.food_type_id ?? '');
  const [serves, setServes] = useState(formatOptionalInteger(recipe?.serves));
  const [makesQuantity, setMakesQuantity] = useState(formatOptionalInteger(recipe?.makes_quantity));
  const [makesThing, setMakesThing] = useState(recipe?.makes_thing ?? '');
  const [verdictId, setVerdictId] = useState(recipe?.verdict_id ?? '');
  const [score, setScore] = useState(recipe?.score?.toString() ?? '');
  const [enthusiasmId, setEnthusiasmId] = useState(recipe?.enthusiasm_id ?? '');
  const [occasionDetails, setOccasionDetails] = useState(recipe?.occasion_details ?? '');
  const [reason, setReason] = useState(recipe?.reason ?? '');
  const [openPicklist, setOpenPicklist] = useState<RecipePicklistKey | null>(null);

  useEffect(() => {
    setAvailablePicklists(picklists);
  }, [picklists]);

  const valuesFor = (category: RecipePicklistValue['category']) =>
    availablePicklists.filter((picklist) => picklist.category === category);
  const picklistValue = (id: string) =>
    availablePicklists.find((picklist) => picklist.id === id)?.value;
  const selectedResponse = state === 'want_to_try' ? enthusiasmId : verdictId;
  const showOccasion = shouldShowOccasionDetails(
    picklistValue(selectedResponse)?.toLowerCase().replaceAll(' ', '_') ?? null,
  );
  const ingredientMentionOptions = buildIngredientMentionOptions(
    ingredientRows.flatMap((row) => {
      const set = ingredientSets.find((item) => item.id === row.ingredientSetId);
      if (isEmptyIngredientRow(row) || !set) {
        return [];
      }
      let portionAmounts: [string, string] | undefined;
      if (row.portionOneRatio != null) {
        try {
          const serialized = serializeMeasurements(row.measurements).map((measurement) => ({
            ...measurement,
            picklist_value: measurement.picklist_value_id
              ? (availablePicklists.find((option) => option.id === measurement.picklist_value_id)
                  ?.display_value ?? null)
              : null,
          }));
          const measurementType =
            row.portionMeasurementType ??
            serialized.find((measurement) =>
              ['volume', 'weight', 'count', 'informal'].includes(measurement.measurement_type),
            )?.measurement_type;
          let ratio = row.portionOneRatio;
          const firstAmount = row.portionOneAmount
            ? parseQuantityInput(row.portionOneAmount)
            : null;
          const total = serialized.find(
            (measurement) => measurement.measurement_type === measurementType,
          )?.amount_min;
          if (firstAmount?.maximum === null && total != null) {
            ratio = getPortionRatio(firstAmount.minimum, total) ?? ratio;
          }
          if (measurementType) {
            portionAmounts =
              getPortionDisplayAmounts(serialized, ratio, measurementType) ?? undefined;
          }
        } catch {
          portionAmounts = undefined;
        }
      }
      return [
        {
          id: row.id,
          ingredientId: row.ingredientId ?? ingredientSlug(row.ingredientName),
          name: row.ingredientName,
          setId: row.ingredientSetId,
          setLabel: set.label,
          portionAmounts,
        },
      ];
    }),
  );

  async function addPicklistOption(category: EditorPicklistCategory, rawValue: string) {
    const result = await createOrGetRecipePicklistValue(category, rawValue);
    if (!result.value) {
      return { error: result.error ?? 'Picklist value could not be added. Try again.' };
    }
    const addedValue = result.value;
    setAvailablePicklists((current) =>
      current.some((item) => item.id === addedValue.id) ? current : [...current, addedValue],
    );
    return { valueId: addedValue.id };
  }

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

  useEffect(() => {
    const dialog = ingredientSetRemovalDialogRef.current;
    if (!dialog) {
      return;
    }
    if (pendingIngredientSetRemoval && !dialog.open) {
      dialog.showModal();
    } else if (!pendingIngredientSetRemoval && dialog.open) {
      dialog.close();
    }
  }, [pendingIngredientSetRemoval]);

  useEffect(() => {
    const createdRecipeId = actionState?.recipeId;
    if (!createdRecipeId || handledCreatedRecipeIdRef.current === createdRecipeId) {
      return;
    }
    handledCreatedRecipeIdRef.current = createdRecipeId;

    if (draftPhotoFiles.length === 0) {
      router.replace(`/recipes/${createdRecipeId}`);
      return;
    }

    setUploadingDraftPhotos(true);
    void uploadMediaFiles('recipe', createdRecipeId, draftPhotoFiles)
      .then(() => router.replace(`/recipes/${createdRecipeId}`))
      .catch((uploadError: unknown) => {
        const detail = uploadError instanceof Error ? ` ${uploadError.message}` : '';
        setDraftPhotoUploadError(
          `The recipe was saved, but its photos could not all be uploaded.${detail}`,
        );
      })
      .finally(() => setUploadingDraftPhotos(false));
  }, [actionState?.recipeId, draftPhotoFiles, router]);

  function togglePicklist(category: RecipePicklistKey) {
    setOpenPicklist((current) => (current === category ? null : category));
  }

  function handleStateChange(nextState: RecipeState) {
    if (state !== nextState) {
      const cleared = clearConditionalValuesForStateChange(state, nextState, {
        verdictId,
        enthusiasmId,
        score,
        occasionDetails,
        reason,
      });
      setVerdictId(cleared.verdictId ?? '');
      setEnthusiasmId(cleared.enthusiasmId ?? '');
      setScore(cleared.score ?? '');
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
      id: createUuid(),
      name: name.trim(),
    };
    const ingredientRow: IngredientRowDraft = {
      id: ingredient.id,
      ingredientSetId: ingredientSets[0]?.id ?? '',
      ingredientId,
      ingredientName: ingredient.name,
      isMain: false,
      detail: '',
      preparation: '',
      measurements: [],
      portionOneRatio: null,
      sizeValue: '',
      sizeUnit: '',
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

  function requestIngredientSetRemoval(setId: string) {
    if (ingredientSets.length <= 1) {
      return false;
    }
    const set = ingredientSets.find((ingredientSet) => ingredientSet.id === setId);
    if (!set) {
      return false;
    }
    const rows = ingredientRows.filter(
      (row) => row.ingredientSetId === setId && !isEmptyIngredientRow(row),
    );
    if (rows.length === 0) {
      setIngredientSets((current) => current.filter((ingredientSet) => ingredientSet.id !== setId));
      setIngredientRows((current) => current.filter((row) => row.ingredientSetId !== setId));
      return true;
    }

    const firstDestination = ingredientSets.find((ingredientSet) => ingredientSet.id !== setId);
    setIngredientSetRemovalMode('');
    setIngredientSetRemovalTargetId(firstDestination?.id ?? '');
    setPendingIngredientSetRemoval({ set, rows });
    return false;
  }

  function confirmIngredientSetRemoval() {
    const pendingRemoval = pendingIngredientSetRemoval;
    if (!pendingRemoval || !ingredientSetRemovalMode) {
      return;
    }
    if (
      ingredientSetRemovalMode === 'move' &&
      !ingredientSets.some((set) => set.id === ingredientSetRemovalTargetId)
    ) {
      return;
    }

    if (ingredientSetRemovalMode === 'move') {
      setIngredientRows((current) =>
        current.map((row) =>
          row.ingredientSetId === pendingRemoval.set.id
            ? { ...row, ingredientSetId: ingredientSetRemovalTargetId }
            : row,
        ),
      );
    } else {
      setInstructionSteps((current) =>
        current.map((step) => ({
          ...step,
          markdown: pendingRemoval.rows.reduce(
            (markdown, row) => unlinkIngredientMentions(markdown, row.id, row.ingredientName),
            step.markdown,
          ),
        })),
      );
      setIngredientRows((current) =>
        current.filter((row) => row.ingredientSetId !== pendingRemoval.set.id),
      );
    }
    setIngredientSets((current) => current.filter((set) => set.id !== pendingRemoval.set.id));
    setPendingIngredientSetRemoval(null);
    setIngredientSetRemovalMode('');
    setIngredientSetRemovalTargetId('');
  }

  function calculateTotal() {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const readMinutes = (field: string) => {
      const input = form.elements.namedItem(field);
      return input instanceof HTMLInputElement ? parseGroupedInteger(input.value) : null;
    };
    const totalInput = form.elements.namedItem('total_time_minutes');
    if (totalInput instanceof HTMLInputElement) {
      totalInput.value = formatGroupedInteger(
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
    const normalizedSets = normalizeIngredientSets(ingredientSets);
    if (!normalizedSets) {
      event.preventDefault();
      setIngredientSetsError(
        'Add a unique, non-empty label of 80 characters or fewer for each section.',
      );
      return;
    }
    const setIdMap = new Map(
      normalizedSets.map((set) => [
        set.id,
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(set.id) ? set.id : createUuid(),
      ]),
    );
    const submittedSets = normalizedSets.map((set) => ({
      ...set,
      id: setIdMap.get(set.id) ?? set.id,
    }));
    let ingredientPayload: ReturnType<typeof serializeIngredientRows>;
    try {
      ingredientPayload = serializeIngredientRows(ingredientRows).map((row) => ({
        ...row,
        ingredient_set_id: setIdMap.get(row.ingredient_set_id) ?? row.ingredient_set_id,
      }));
      const setIds = new Set(submittedSets.map((set) => set.id));
      if (ingredientPayload.some((row) => !setIds.has(row.ingredient_set_id))) {
        throw new Error('Choose a section for each ingredient row.');
      }
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
          id: step.id === 'instruction-draft' ? createUuid() : step.id,
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
    const ingredientSetsInput = event.currentTarget.elements.namedItem('ingredient_sets');
    const instructionInput = event.currentTarget.elements.namedItem('instruction_steps');
    if (ingredientInput instanceof HTMLInputElement) {
      ingredientInput.value = JSON.stringify(ingredientPayload);
    }
    if (ingredientSetsInput instanceof HTMLInputElement) {
      ingredientSetsInput.value = JSON.stringify(submittedSets);
    }
    if (instructionInput instanceof HTMLInputElement) {
      instructionInput.value = JSON.stringify(instructionPayload);
    }
    setIngredientRowsError('');
    setIngredientSetsError('');
    setInstructionStepsError('');
  }

  const form = (
    <form
      action={formAction}
      className="recipe-form"
      id="recipe-form"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !(event.target instanceof HTMLButtonElement) &&
          !(event.target instanceof HTMLTextAreaElement)
        ) {
          event.preventDefault();
        }
      }}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <input name="ingredient_rows" type="hidden" defaultValue="[]" />
      <input name="ingredient_sets" type="hidden" defaultValue="[]" />
      <input name="instruction_steps" type="hidden" defaultValue="[]" />
      {recipe && (
        <>
          <input name="recipe_id" type="hidden" value={recipe.id} />
          <input name="expected_version" type="hidden" value={recipe.version} />
        </>
      )}
      <fieldset className="recipe-metadata-section">
        <legend>Recipe</legend>
        {recipe ? (
          <div className="recipe-name-media-row">
            <RecipeNameField initialName={recipe.name} />
            <MediaManager
              assets={mediaAssets}
              expectedVersion={recipe.version}
              onPhotoDeleted={(assetId) =>
                setInstructionSteps((currentSteps) =>
                  currentSteps.map((step) => {
                    let markdown = step.markdown;
                    try {
                      markdown = unlinkInstructionPhoto(markdown, assetId);
                    } catch {
                      return step;
                    }
                    return markdown === step.markdown
                      ? step
                      : { ...step, markdown, plainText: instructionPlainText(markdown) };
                  }),
                )
              }
              parentId={recipe.id}
              parentName={recipe.name}
              parentType="recipe"
              referencedPhotoSteps={photoReferenceStepNumbers}
            />
          </div>
        ) : (
          <RecipePhotoDraftPicker
            disabled={pending || uploadingDraftPhotos || Boolean(actionState?.recipeId)}
            nameField={<RecipeNameField initialName="" />}
            onFilesChange={setDraftPhotoFiles}
          />
        )}
        {draftPhotoUploadError && actionState?.recipeId && (
          <p className="recipe-form-error" role="alert">
            {draftPhotoUploadError}{' '}
            <a href={`/recipes/${actionState.recipeId}/edit`}>
              Open the recipe editor to manage photos.
            </a>
          </p>
        )}
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
          {state === 'tried' && (
            <SinglePicklist
              label="Rating"
              name="score"
              menuClassName="recipe-picklist-menu recipe-score-picklist-menu"
              value={score}
              placeholder="—"
              options={recipeScoreValues.map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              isOpen={openPicklist === 'score'}
              onOpenChange={(isOpen) => setOpenPicklist(isOpen ? 'score' : null)}
              onChange={setScore}
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
              inputMode="numeric"
              type="text"
              value={serves}
              onBlur={() => setServes(formatGroupedIntegerInput(serves))}
              onChange={(event) => setServes(event.currentTarget.value)}
            />
          </label>
          <fieldset className="recipe-field recipe-makes-field">
            <legend>Makes</legend>
            <div className="recipe-makes-inputs">
              <input
                aria-label="Makes quantity"
                id="makes-quantity"
                inputMode="numeric"
                name="makes_quantity"
                placeholder="Qty"
                type="text"
                value={makesQuantity}
                onBlur={(event) =>
                  setMakesQuantity(formatGroupedIntegerInput(event.currentTarget.value))
                }
                onChange={(event) => setMakesQuantity(event.currentTarget.value)}
              />
              <input
                aria-label="Makes thing"
                id="makes-thing"
                name="makes_thing"
                placeholder="What it makes"
                type="text"
                value={makesThing}
                onChange={(event) => setMakesThing(event.currentTarget.value)}
              />
            </div>
          </fieldset>
          <MultiPicklist
            category="equipment"
            label="Equipment"
            values={valuesFor('equipment')}
            selectedIds={recipe?.equipment_ids ?? []}
            isOpen={openPicklist === 'equipment'}
            onToggle={() => togglePicklist('equipment')}
            onClose={() => setOpenPicklist(null)}
            onAddOption={(value) => addPicklistOption('equipment', value)}
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
            onAddOption={(value) => addPicklistOption('food_type', value)}
          />
          <MultiPicklist
            category="meal_type"
            label="Meal Type"
            values={valuesFor('meal_type')}
            selectedIds={recipe?.meal_type_ids ?? []}
            isOpen={openPicklist === 'meal_type'}
            onToggle={() => togglePicklist('meal_type')}
            onClose={() => setOpenPicklist(null)}
            onAddOption={(value) => addPicklistOption('meal_type', value)}
          />
          <MultiPicklist
            category="cuisine"
            label="Cuisine"
            values={valuesFor('cuisine')}
            selectedIds={recipe?.cuisine_ids ?? []}
            isOpen={openPicklist === 'cuisine'}
            onToggle={() => togglePicklist('cuisine')}
            onClose={() => setOpenPicklist(null)}
            onAddOption={(value) => addPicklistOption('cuisine', value)}
          />
          <div className="recipe-form-save-row">
            <button
              aria-label="Save recipe"
              className="recipe-primary-button"
              disabled={pending || uploadingDraftPhotos || Boolean(actionState?.recipeId)}
              type="submit"
            >
              {pending ? 'Saving…' : uploadingDraftPhotos ? 'Uploading photos…' : 'Save'}
            </button>
          </div>
        </div>
        <TagMultiSelect tags={tags} selectedIds={recipe?.tags.map((tag) => tag.id)} />
      </fieldset>
      <fieldset className="recipe-ingredient-section">
        <legend>Ingredients</legend>
        {ingredientSetsError && (
          <p className="recipe-form-error" role="alert">
            {ingredientSetsError}
          </p>
        )}
        <IngredientRowsEditor
          ingredients={ingredients}
          picklists={availablePicklists}
          preparationOptions={preparationOptions}
          rows={ingredientRows}
          ingredientSets={ingredientSets}
          onIngredientSetsChange={setIngredientSets}
          onRemoveSetRequested={requestIngredientSetRemoval}
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
          mentionOptions={ingredientMentionOptions}
          availableIngredients={ingredients}
          photos={mediaAssets ?? []}
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
      {pendingIngredientSetRemoval && (
        <dialog
          aria-describedby="ingredient-set-removal-description"
          aria-labelledby="ingredient-set-removal-title"
          className="recipe-confirmation-dialog"
          ref={ingredientSetRemovalDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            event.currentTarget.close();
            setPendingIngredientSetRemoval(null);
            setIngredientSetRemovalMode('');
          }}
        >
          <h2 id="ingredient-set-removal-title">Remove section?</h2>
          <p id="ingredient-set-removal-description">
            {pendingIngredientSetRemoval.set.label} contains{' '}
            {pendingIngredientSetRemoval.rows.length} ingredients. Choose what happens to them.
          </p>
          <fieldset className="publication-delete-dispositions">
            <legend>Ingredient disposition</legend>
            <label>
              <input
                checked={ingredientSetRemovalMode === 'delete'}
                name="ingredient-set-removal-mode"
                type="radio"
                value="delete"
                onChange={() => setIngredientSetRemovalMode('delete')}
              />
              Delete ingredients
            </label>
            <label>
              <input
                checked={ingredientSetRemovalMode === 'move'}
                name="ingredient-set-removal-mode"
                type="radio"
                value="move"
                onChange={() => setIngredientSetRemovalMode('move')}
              />
              Move ingredients to another section
            </label>
            {ingredientSetRemovalMode === 'move' && (
              <label>
                <span>Destination section</span>
                <select
                  value={ingredientSetRemovalTargetId}
                  onChange={(event) => setIngredientSetRemovalTargetId(event.target.value)}
                >
                  {ingredientSets
                    .filter((set) => set.id !== pendingIngredientSetRemoval.set.id)
                    .map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
          {ingredientSetRemovalMode === 'delete' && (
            <p>Structured ingredient mentions will become plain text.</p>
          )}
          <div className="recipe-confirmation-actions">
            <button
              className="recipe-secondary-button"
              type="button"
              onClick={() => {
                ingredientSetRemovalDialogRef.current?.close();
                setPendingIngredientSetRemoval(null);
                setIngredientSetRemovalMode('');
              }}
            >
              Cancel
            </button>
            <button
              className="recipe-primary-button"
              disabled={
                !ingredientSetRemovalMode ||
                (ingredientSetRemovalMode === 'move' && !ingredientSetRemovalTargetId)
              }
              type="button"
              onClick={confirmIngredientSetRemoval}
            >
              {ingredientSetRemovalMode === 'move'
                ? 'Move and remove section'
                : 'Delete section and ingredients'}
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
                inputMode="numeric"
                type="text"
                defaultValue={formatOptionalInteger(recipe?.[name])}
                onBlur={(event) => {
                  event.currentTarget.value = formatGroupedIntegerInput(event.currentTarget.value);
                }}
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
              inputMode="numeric"
              type="text"
              defaultValue={formatOptionalInteger(recipe?.total_time_minutes)}
              onBlur={(event) => {
                event.currentTarget.value = formatGroupedIntegerInput(event.currentTarget.value);
              }}
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
          <button
            aria-label={
              recipe
                ? 'Save changes from the Total Time row'
                : 'Save new recipe from the Total Time row'
            }
            className="recipe-primary-button recipe-time-submit-button"
            disabled={pending || uploadingDraftPhotos || Boolean(actionState?.recipeId)}
            type="submit"
          >
            {pending ? 'Saving…' : uploadingDraftPhotos ? 'Uploading photos…' : 'Save'}
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
    </form>
  );

  return (
    <>
      {form}
      <div className="recipe-form-actions">
        <a className="recipe-secondary-link" href={recipe ? `/recipes/${recipe.id}` : '/recipes'}>
          Cancel
        </a>
        {recipe && (
          <RecipeDeleteAction
            buttonLabel="Delete"
            recipeId={recipe.id}
            recipeName={recipe.name}
            version={recipe.version}
          />
        )}
      </div>
    </>
  );
}
