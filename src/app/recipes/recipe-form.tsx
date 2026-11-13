'use client';

import { Salad, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useActionState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  calculateRecipeNutrition,
  type NutrientValues,
  roundNutrientValues,
} from '../../lib/recipes/nutrition-rules';
import { normalizePicklistMatchText } from '../../lib/recipes/picklist-rules';
import {
  clearConditionalValuesForStateChange,
  formatRecipeDuration,
  recipeScoreValues,
  shouldShowOccasionDetails,
} from '../../lib/recipes/recipe-rules';
import { MAX_RECIPE_MINUTES, parseTimeExpression } from '../../lib/recipes/time-rules';
import { createUuid } from '../../lib/uuid';
import {
  createOrGetRecipePicklistValue,
  type EditorPicklistCategory,
} from '../actions/recipe-picklists';
import { MediaManager } from '../media/media-manager';
import { RecipePhotoDraftPicker } from '../media/recipe-photo-draft-picker';
import { uploadMediaFiles } from '../media/upload-files';
import { NutritionEstimate } from '../nutrition/nutrition-estimate';
import { NutritionPane, type NutritionPaneSave } from '../nutrition/nutrition-pane';
import { Picklist } from '../picklist';
import { ReorderGrip } from '../reorder-grip';
import { TagMultiSelect } from '../tags/tag-controls';
import { saveRecipe } from './actions';
import { IngredientRowsEditor, SuggestionCellEditor } from './ingredient-rows-editor';
import { InstructionStepsEditor } from './instruction-steps-editor';
import { MultiPicklist, type RecipeMultiSelectCategory } from './multi-picklist';
import { PublicationPicker } from './publication-picker';
import { RecipeDeleteAction } from './recipe-detail-actions';
import { RecipeRelationshipsEditor } from './recipe-relationships-editor';
import { useReorderDrag } from './use-reorder-drag';

type RecipeFormProps = {
  ingredients: IngredientOption[];
  initialPublicationId?: string | null;
  mediaAssets?: MediaAssetDisplay[];
  picklists: RecipePicklistValue[];
  preparationOptions: string[];
  publications: PublicationOption[];
  recipeOptions: IngredientOption[];
  tags: TagOption[];
  initialSaveNotice?: boolean;
  recipe?: RecipeRecord;
};

type RecipeSinglePicklistCategory = 'food_type' | 'state' | 'verdict' | 'enthusiasm' | 'score';
type RecipePicklistKey = RecipeMultiSelectCategory | RecipeSinglePicklistCategory;
type SinglePicklistOption = {
  value: string;
  label: string;
};

type RecipeTimeEntryDraft = {
  id: string;
  timeTypeId: string;
  expression: string;
  minutes: number | null;
  error: string;
  typeError: string;
};

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
  describedBy,
  invalid = false,
  onOpenChange,
  onChange,
}: {
  label: string;
  name: string;
  menuClassName?: string;
  value: string;
  placeholder: string;
  options: SinglePicklistOption[];
  isOpen: boolean;
  describedBy?: string;
  invalid?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="recipe-field recipe-single-picklist">
      <span>{label}</span>
      <Picklist
        className="recipe-picklist-trigger"
        describedBy={describedBy}
        invalid={invalid}
        label={label}
        measureLabel={placeholder}
        menuClassName={menuClassName}
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

function FoodTypePicklist({
  value,
  options,
  onOpenChange,
  onChange,
  onAddOption,
}: {
  value: string;
  options: SinglePicklistOption[];
  onOpenChange: (isOpen: boolean) => void;
  onChange: (value: string) => void;
  onAddOption: (value: string) => Promise<{ valueId?: string; error?: string }>;
}) {
  const [addError, setAddError] = useState('');
  const selectedOption = options.find((option) => option.value === value);

  async function selectSuggestion(rawValue: string) {
    setAddError('');
    const existingOption = options.find(
      (option) => normalizePicklistMatchText(option.label) === normalizePicklistMatchText(rawValue),
    );
    if (existingOption) {
      onChange(existingOption.value);
      onOpenChange(false);
      return;
    }

    const result = await onAddOption(rawValue);
    if (result.error || !result.valueId) {
      setAddError(result.error ?? 'Food Type could not be added. Try again.');
      return;
    }
    onChange(result.valueId);
    onOpenChange(false);
  }

  return (
    <div
      className="recipe-field recipe-single-picklist"
      onFocusCapture={() => onOpenChange(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          onOpenChange(false);
        }
      }}
    >
      <span>Food Type</span>
      <SuggestionCellEditor
        label="Food Type"
        options={options.map((option) => option.label)}
        value={selectedOption?.label ?? ''}
        onCommit={() => {}}
        onSelectSuggestion={(suggestion) => {
          void selectSuggestion(suggestion);
        }}
        onCancel={() => onOpenChange(false)}
        onDraftChange={() => {
          if (addError) {
            setAddError('');
          }
        }}
        resetOnCancel
        syncValue
        focusOnMount={false}
        allowTabToSelectAdd={false}
      />
      {addError && (
        <p className="recipe-form-error" role="alert">
          {addError}
        </p>
      )}
      <input name="food_type_id" type="hidden" value={value} />
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
  initialSaveNotice = false,
  recipe,
}: RecipeFormProps) {
  const [actionState, formAction, pending] = useActionState(saveRecipe, undefined);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const shortcutSaveButtonRef = useRef<HTMLButtonElement>(null);
  const handledCreatedRecipeIdRef = useRef<string | null>(null);
  const [savedRecipeVersion, setSavedRecipeVersion] = useState<number | undefined>();
  const [saveNotice, setSaveNotice] = useState(initialSaveNotice ? 'Saved.' : '');
  const currentRecipeVersion = actionState?.recipeVersion ?? savedRecipeVersion ?? recipe?.version;
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
        nutritionServingSizeOverride: row.nutrition_serving_size_override,
        nutritionOverrides: row.nutrition_overrides,
      })) ?? [],
  );
  const [nutritionOverrides, setNutritionOverrides] = useState<NutrientValues>(
    () => recipe?.nutrition_overrides ?? {},
  );
  const [isNutritionPaneOpen, setIsNutritionPaneOpen] = useState(false);
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
  const [timeEntries, setTimeEntries] = useState<RecipeTimeEntryDraft[]>(
    () =>
      recipe?.time_entries.map((entry) => ({
        id: entry.id,
        timeTypeId: entry.time_type_id,
        expression: formatGroupedInteger(entry.minutes),
        minutes: entry.minutes,
        error: '',
        typeError: '',
      })) ?? [],
  );
  const [timeEntriesError, setTimeEntriesError] = useState('');
  const [timeEntriesAnnouncement, setTimeEntriesAnnouncement] = useState('');
  const timeFieldsRef = useRef<HTMLDivElement>(null);
  const pendingTimeDrop = useRef<{ sourceId: string; rowTops: Map<string, number> } | null>(null);
  const [timeDropOffsets, setTimeDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [timeDropCommitPending, setTimeDropCommitPending] = useState(false);
  const [settlingTimeEntryId, setSettlingTimeEntryId] = useState<string | null>(null);
  const reorderDrag = useReorderDrag();
  const dragPreview = reorderDrag.preview;

  useLayoutEffect(() => {
    if (dragPreview) {
      return;
    }
    const pending = pendingTimeDrop.current;
    if (!pending) {
      return;
    }
    pendingTimeDrop.current = null;

    const offsets = new Map<string, number>();
    for (const row of Array.from(
      timeFieldsRef.current?.querySelectorAll<HTMLElement>(
        '.recipe-time-entry-row[data-time-entry-id]',
      ) ?? [],
    )) {
      const entryId = row.dataset.timeEntryId;
      const startingTop = entryId ? pending.rowTops.get(entryId) : undefined;
      if (entryId && startingTop !== undefined && row.getBoundingClientRect().height > 0) {
        offsets.set(entryId, startingTop - row.getBoundingClientRect().top);
      }
    }
    if (!offsets.size) {
      setTimeDropCommitPending(false);
      return;
    }

    setTimeDropOffsets(offsets);
    setTimeDropCommitPending(false);
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettlingTimeEntryId(
      canAnimate && Math.abs(offsets.get(pending.sourceId) ?? 0) > 0.5 ? pending.sourceId : null,
    );
    window.requestAnimationFrame(() => setTimeDropOffsets(new Map()));
  }, [dragPreview]);

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
  const [openPicklist, setOpenPicklist] = useState<string | null>(null);

  const totalTimeMinutes = timeEntries.reduce(
    (total, entry) => total + BigInt(entry.minutes ?? 0),
    BigInt(0),
  );
  const totalTimeExceedsLimit = totalTimeMinutes > BigInt(MAX_RECIPE_MINUTES);
  const parsedServes = serves ? parseGroupedInteger(serves) : null;
  const effectiveServes = parsedServes && parsedServes > 0 ? parsedServes : null;
  const nutritionState = useMemo(() => {
    const ingredientInputs = ingredientRows
      .filter((row) => !isEmptyIngredientRow(row))
      .map((row) => {
        const ingredient =
          ingredients.find((option) => option.id === row.ingredientId) ??
          ingredients.find(
            (option) =>
              option.name.toLocaleLowerCase() === row.ingredientName.trim().toLocaleLowerCase(),
          );
        return {
          ingredientId: row.id,
          ingredientName: row.ingredientName.trim() || ingredient?.name || 'Ingredient',
          measurements: row.measurements.flatMap((measurement) => {
            if (!measurement.type) return [];
            const parsed =
              measurement.type === 'unmeasured' ? null : parseQuantityInput(measurement.quantity);
            return [
              {
                type: measurement.type,
                amount: parsed?.minimum ?? null,
                maximum: parsed?.maximum ?? null,
                unitCode: measurement.unitCode || null,
                picklistValueId: measurement.picklistValueId || null,
                picklistValue: measurement.picklistValueId
                  ? (availablePicklists.find((value) => value.id === measurement.picklistValueId)
                      ?.display_value ?? null)
                  : null,
              },
            ];
          }),
          profile: ingredient?.nutritionProfile ?? null,
          servingSizeOverride: row.nutritionServingSizeOverride ?? null,
          nutrientOverrides: row.nutritionOverrides ?? {},
          density: ingredient?.density ?? null,
          equivalent: ingredient?.nutritionEquivalent ?? null,
        };
      });
    const calculated = calculateRecipeNutrition(ingredientInputs, effectiveServes);
    const manualValues: NutrientValues =
      effectiveServes === null
        ? {}
        : (Object.fromEntries(
            Object.entries(nutritionOverrides).flatMap(([key, value]) =>
              typeof value === 'number' ? [[key, value / effectiveServes]] : [],
            ),
          ) as NutrientValues);
    return {
      result: calculateRecipeNutrition(ingredientInputs, effectiveServes, nutritionOverrides),
      calculatedValues: roundNutrientValues(calculated.perServing ?? {}),
      manualValues,
    };
  }, [availablePicklists, effectiveServes, ingredientRows, ingredients, nutritionOverrides]);

  useEffect(() => {
    setAvailablePicklists(picklists);
  }, [picklists]);

  useEffect(() => {
    if (actionState?.recipeVersion !== undefined) {
      setSavedRecipeVersion(actionState.recipeVersion);
    }
    if (actionState?.saved) {
      setSaveNotice('Saved.');
    } else if (actionState?.error) {
      setSaveNotice('');
    }
  }, [actionState?.error, actionState?.recipeVersion, actionState?.saved]);

  useEffect(() => {
    if (initialSaveNotice && recipe) {
      router.replace(`/recipes/${recipe.id}/edit`, { scroll: false });
    }
  }, [initialSaveNotice, recipe, router]);

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

  const timeTypeOptions = valuesFor('time_type').map((option) => ({
    value: option.id,
    label: option.display_value,
  }));

  function updateTimeEntry(entryId: string, update: Partial<RecipeTimeEntryDraft>) {
    setTimeEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, ...update } : entry)),
    );
  }

  function commitTimeType(entryId: string, rawValue: string) {
    const value = rawValue.trim();
    const option = timeTypeOptions.find(
      (item) => item.label.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    if (!value) {
      updateTimeEntry(entryId, { timeTypeId: '', typeError: '' });
    } else if (option) {
      updateTimeEntry(entryId, { timeTypeId: option.value, typeError: '' });
    } else {
      updateTimeEntry(entryId, {
        typeError: 'Choose a Time Type or select its Add suggestion.',
      });
    }
  }

  async function selectTimeType(entryId: string, rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      updateTimeEntry(entryId, { typeError: 'Choose a Time Type.' });
      return;
    }
    const option = timeTypeOptions.find(
      (item) => item.label.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    if (option) {
      updateTimeEntry(entryId, { timeTypeId: option.value, typeError: '' });
      return;
    }

    try {
      const result = await addPicklistOption('time_type', value);
      if (!result.valueId) {
        updateTimeEntry(entryId, {
          typeError: result.error ?? 'Time Type could not be added. Try again.',
        });
        return;
      }
      updateTimeEntry(entryId, { timeTypeId: result.valueId, typeError: '' });
    } catch (error) {
      updateTimeEntry(entryId, {
        typeError:
          error instanceof Error ? error.message : 'Time Type could not be added. Try again.',
      });
    }
  }

  function moveTimeEntry(entryId: string, offset: -1 | 1) {
    const currentIndex = timeEntries.findIndex((entry) => entry.id === entryId);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= timeEntries.length) {
      return;
    }

    const reordered = [...timeEntries];
    [reordered[currentIndex], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[currentIndex],
    ];
    setTimeEntries(reordered);
    setTimeEntriesAnnouncement(`Time entry moved to position ${nextIndex + 1}.`);
  }

  function reorderTimeEntries(order: string[], sourceId: string) {
    const entriesById = new Map(timeEntries.map((entry) => [entry.id, entry]));
    if (
      order.length !== timeEntries.length ||
      new Set(order).size !== order.length ||
      order.some((entryId) => !entriesById.has(entryId))
    ) {
      setTimeEntriesAnnouncement('Time entry order could not be changed. Please try again.');
      return;
    }

    const reordered = order
      .map((entryId) => entriesById.get(entryId))
      .filter((entry): entry is RecipeTimeEntryDraft => entry !== undefined);
    setTimeEntries(reordered);
    setTimeEntriesAnnouncement(`Time entry moved to position ${order.indexOf(sourceId) + 1}.`);
  }

  function addTimeEntry() {
    setTimeEntries((current) => [
      ...current,
      {
        id: createUuid(),
        timeTypeId: timeTypeOptions[0]?.value ?? '',
        expression: '',
        minutes: null,
        error: '',
        typeError: '',
      },
    ]);
    setTimeEntriesError('');
    setTimeEntriesAnnouncement('');
  }

  function evaluateTimeEntry(entryId: string, expression: string) {
    try {
      const minutes = parseTimeExpression(expression);
      updateTimeEntry(entryId, {
        expression: formatGroupedInteger(minutes),
        minutes,
        error: '',
      });
      setTimeEntriesError('');
    } catch (error) {
      updateTimeEntry(entryId, {
        expression,
        error: error instanceof Error ? error.message : 'Check this time expression.',
      });
    }
  }

  function removeTimeEntry(entryId: string) {
    setTimeEntries((current) => current.filter((entry) => entry.id !== entryId));
    setTimeEntriesError('');
    setTimeEntriesAnnouncement('');
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
    const destination = actionState.stayInEditor
      ? `/recipes/${createdRecipeId}/edit?saved=shortcut`
      : `/recipes/${createdRecipeId}`;

    if (draftPhotoFiles.length === 0) {
      router.replace(destination);
      return;
    }

    setUploadingDraftPhotos(true);
    void uploadMediaFiles('recipe', createdRecipeId, draftPhotoFiles)
      .then(() => router.replace(destination))
      .catch((uploadError: unknown) => {
        const detail = uploadError instanceof Error ? ` ${uploadError.message}` : '';
        setDraftPhotoUploadError(
          `The recipe was saved, but its photos could not all be uploaded.${detail}`,
        );
      })
      .finally(() => setUploadingDraftPhotos(false));
  }, [actionState?.recipeId, actionState?.stayInEditor, draftPhotoFiles, router]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    setSaveNotice('');
    const availableTimeTypeIds = new Set(timeTypeOptions.map((option) => option.value));
    const evaluatedTimeEntries = timeEntries.map((entry) => {
      let minutes: number | null = null;
      let error = '';
      let typeError = entry.typeError;
      if (!availableTimeTypeIds.has(entry.timeTypeId)) {
        typeError ||= 'Choose a Time Type.';
      }
      try {
        minutes = parseTimeExpression(entry.expression);
      } catch (evaluationError) {
        error =
          evaluationError instanceof Error
            ? evaluationError.message
            : 'Check this time expression.';
      }
      return { entry, minutes, error, typeError };
    });
    const submittedTotal = evaluatedTimeEntries.reduce(
      (total, evaluated) => total + BigInt(evaluated.minutes ?? 0),
      BigInt(0),
    );
    const totalExceedsLimit = submittedTotal > BigInt(MAX_RECIPE_MINUTES);
    if (
      evaluatedTimeEntries.some(({ error, typeError }) => error || typeError) ||
      totalExceedsLimit
    ) {
      event.preventDefault();
      setTimeEntries((current) =>
        current.map((entry, index) => {
          const evaluated = evaluatedTimeEntries[index];
          return {
            ...entry,
            ...(evaluated.minutes === null
              ? {}
              : {
                  minutes: evaluated.minutes,
                  expression: formatGroupedInteger(evaluated.minutes),
                }),
            error: evaluated.error,
            typeError: evaluated.typeError,
          };
        }),
      );
      setTimeEntriesError(
        totalExceedsLimit
          ? 'Total time exceeds the supported whole-minute limit.'
          : 'Check the highlighted time entries before saving.',
      );
      return;
    }
    const submittedTimeEntries = evaluatedTimeEntries.map(({ entry, minutes }, position) => ({
      time_type_id: entry.timeTypeId,
      minutes: minutes ?? 0,
      position,
    }));

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
    const nutritionInput = event.currentTarget.elements.namedItem('nutrition_overrides');
    const timeEntriesInput = event.currentTarget.elements.namedItem('time_entries');
    if (ingredientInput instanceof HTMLInputElement) {
      ingredientInput.value = JSON.stringify(ingredientPayload);
    }
    if (ingredientSetsInput instanceof HTMLInputElement) {
      ingredientSetsInput.value = JSON.stringify(submittedSets);
    }
    if (instructionInput instanceof HTMLInputElement) {
      instructionInput.value = JSON.stringify(instructionPayload);
    }
    if (nutritionInput instanceof HTMLInputElement) {
      nutritionInput.value = JSON.stringify(nutritionOverrides);
    }
    if (timeEntriesInput instanceof HTMLInputElement) {
      timeEntriesInput.value = JSON.stringify(submittedTimeEntries);
    }
    setIngredientRowsError('');
    setIngredientSetsError('');
    setInstructionStepsError('');
    setTimeEntriesError('');
  }

  const form = (
    <form
      action={formAction}
      className="recipe-form"
      id="recipe-form"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          if (
            event.repeat ||
            pending ||
            uploadingDraftPhotos ||
            actionState?.recipeId ||
            (event.target instanceof HTMLElement && event.target.closest('dialog[open]'))
          ) {
            return;
          }
          const submitter = shortcutSaveButtonRef.current;
          if (submitter) {
            formRef.current?.requestSubmit(submitter);
          }
          return;
        }
        if (
          event.key === 'Enter' &&
          !(event.target instanceof HTMLButtonElement) &&
          !(event.target instanceof HTMLTextAreaElement)
        ) {
          event.preventDefault();
        }
      }}
      onSubmit={handleSubmit}
      onChangeCapture={() => setSaveNotice('')}
      ref={formRef}
    >
      <input name="ingredient_rows" type="hidden" defaultValue="[]" />
      <input name="ingredient_sets" type="hidden" defaultValue="[]" />
      <input name="instruction_steps" type="hidden" defaultValue="[]" />
      <input name="nutrition_overrides" type="hidden" defaultValue="{}" />
      <input name="time_entries" type="hidden" defaultValue="[]" />
      <button hidden name="save_mode" ref={shortcutSaveButtonRef} type="submit" value="shortcut" />
      {saveNotice && (
        <p aria-live="polite" className="recipe-form-save-status" role="status">
          {saveNotice}
        </p>
      )}
      {recipe && (
        <>
          <input name="recipe_id" type="hidden" value={recipe.id} />
          <input name="expected_version" type="hidden" value={currentRecipeVersion} />
        </>
      )}
      <fieldset className="recipe-metadata-section">
        <legend>Recipe</legend>
        {recipe ? (
          <div className="recipe-name-media-row">
            <RecipeNameField initialName={recipe.name} />
            <MediaManager
              assets={mediaAssets}
              expectedVersion={currentRecipeVersion ?? recipe.version}
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
          <FoodTypePicklist
            value={foodTypeId}
            options={valuesFor('food_type').map((value) => ({
              value: value.id,
              label: value.display_value,
            }))}
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
        <div className="recipe-nutrition-editor">
          <div className="recipe-nutrition-editor-heading">
            <h3>Nutrition</h3>
            <button
              aria-label="Edit recipe nutrition"
              aria-describedby={
                effectiveServes === null ? 'recipe-nutrition-serves-required' : undefined
              }
              className="recipe-nutrition-edit-button"
              disabled={effectiveServes === null}
              type="button"
              onClick={() => setIsNutritionPaneOpen(true)}
            >
              <Salad aria-hidden="true" size={18} />
              <span>Edit</span>
            </button>
          </div>
          {effectiveServes === null ? (
            <p
              className="recipe-nutrition-incomplete"
              id="recipe-nutrition-serves-required"
              role="status"
            >
              Enter a positive Serves value to calculate or edit nutrition per serving.
            </p>
          ) : nutritionState.result.perServing?.calories !== undefined ? (
            <NutritionEstimate
              label="Estimated per serving"
              values={nutritionState.result.perServing}
            />
          ) : nutritionState.result.hasData ? (
            <p className="recipe-nutrition-incomplete" role="status">
              Nutrition is incomplete. {nutritionState.result.reasons.join(' ')}
            </p>
          ) : (
            <p className="recipe-nutrition-empty">
              Add nutrition facts to ingredients or the recipe.
            </p>
          )}
        </div>
        {isNutritionPaneOpen && effectiveServes !== null && (
          <NutritionPane
            mode="recipe"
            title={recipe?.name.trim() || 'This recipe'}
            calculatedValues={nutritionState.calculatedValues}
            contributions={nutritionState.result.contributions}
            manualValues={nutritionState.manualValues}
            onCancel={() => setIsNutritionPaneOpen(false)}
            onClear={() => {
              setNutritionOverrides({});
              setIsNutritionPaneOpen(false);
            }}
            onSave={(value: NutritionPaneSave) => {
              const nextOverrides: NutrientValues = {};
              const editedKeys = new Set(value.editedKeys);
              for (const key of value.manualKeys) {
                const amount = value.values[key];
                if (amount === undefined) continue;
                const existing = nutritionOverrides[key];
                nextOverrides[key] =
                  existing !== undefined && !editedKeys.has(key)
                    ? existing
                    : amount * effectiveServes;
              }
              setNutritionOverrides(nextOverrides);
              setIsNutritionPaneOpen(false);
            }}
          />
        )}
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
              className="recipe-secondary-button"
              type="button"
              onClick={() => {
                ingredientDeletionDialogRef.current?.close();
                setPendingIngredientDeletion(null);
              }}
            >
              Cancel
            </button>
            <button
              className="recipe-primary-button"
              type="button"
              onClick={confirmIngredientDeletion}
            >
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
      <fieldset className="recipe-time-fieldset">
        <legend>Times (min)</legend>
        <div className="recipe-time-fields" ref={timeFieldsRef}>
          {timeEntries.length > 0 && (
            <div aria-hidden="true" className="recipe-time-entry-headers">
              <span />
              <span>Minutes</span>
              <span>Time Type</span>
              <span />
            </div>
          )}
          {timeEntries.map((entry, index) => {
            const expressionId = `time-expression-${entry.id}`;
            const expressionErrorId = `${expressionId}-error`;
            const typeErrorId = `time-type-${entry.id}-error`;
            const sourceIndex = dragPreview
              ? timeEntries.findIndex((item) => item.id === dragPreview.sourceId)
              : -1;
            const targetIndex = dragPreview
              ? timeEntries.findIndex((item) => item.id === dragPreview.targetId)
              : -1;
            const reorderState =
              dragPreview?.sourceId === entry.id
                ? 'dragging'
                : dragPreview &&
                    ((sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) ||
                      (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex))
                  ? 'displaced'
                  : settlingTimeEntryId === entry.id
                    ? 'settling'
                    : undefined;
            const dragOffset = dragPreview?.offsets.get(entry.id);
            const dropOffset = timeDropOffsets.get(entry.id);
            const transform =
              dragPreview && reorderState === 'dragging'
                ? `translateY(${dragPreview.pointerOffset}px)`
                : dragPreview && reorderState === 'displaced' && dragOffset !== undefined
                  ? `translateY(${dragOffset}px)`
                  : dropOffset !== undefined
                    ? `translateY(${dropOffset}px)`
                    : undefined;
            return (
              <fieldset
                className="recipe-time-entry-row"
                data-reorder-state={reorderState}
                data-time-entry-id={entry.id}
                key={entry.id}
                style={{
                  transform,
                  transition:
                    timeDropCommitPending || timeDropOffsets.has(entry.id) ? 'none' : undefined,
                }}
                onTransitionEnd={(event) => {
                  if (event.propertyName === 'transform' && settlingTimeEntryId === entry.id) {
                    setSettlingTimeEntryId(null);
                  }
                }}
              >
                <legend className="visually-hidden">Time entry {index + 1}</legend>
                <button
                  aria-label={`Reorder time entry ${index + 1}`}
                  className="recipe-time-entry-drag-handle"
                  title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
                  type="button"
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    const rowBounds = Array.from(
                      timeFieldsRef.current?.querySelectorAll<HTMLElement>(
                        '.recipe-time-entry-row[data-time-entry-id]',
                      ) ?? [],
                    ).flatMap((row) => {
                      const rowId = row.dataset.timeEntryId;
                      if (!rowId || row.getBoundingClientRect().height === 0) {
                        return [];
                      }
                      const bounds = row.getBoundingClientRect();
                      return [
                        {
                          id: rowId,
                          top: bounds.top + window.scrollY,
                          bottom: bounds.bottom + window.scrollY,
                        },
                      ];
                    });
                    const sourceElement =
                      event.currentTarget.closest<HTMLElement>('.recipe-time-entry-row');
                    reorderDrag.start(
                      entry.id,
                      event.clientY,
                      sourceElement?.getBoundingClientRect().height ?? 48,
                      rowBounds,
                    );
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => reorderDrag.move(event.clientY)}
                  onPointerUp={(event) => {
                    const hitTargetId = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest<HTMLElement>('.recipe-time-entry-row')?.dataset.timeEntryId;
                    const draggedEntry = reorderDrag.finish(hitTargetId);
                    if (!draggedEntry || draggedEntry.sourceId === draggedEntry.targetId) {
                      return;
                    }

                    const rowTops = new Map(
                      Array.from(
                        timeFieldsRef.current?.querySelectorAll<HTMLElement>(
                          '.recipe-time-entry-row[data-time-entry-id]',
                        ) ?? [],
                      ).flatMap((row) => {
                        const rowId = row.dataset.timeEntryId;
                        return rowId ? [[rowId, row.getBoundingClientRect().top] as const] : [];
                      }),
                    );
                    pendingTimeDrop.current = { sourceId: draggedEntry.sourceId, rowTops };
                    setTimeDropCommitPending(true);
                    reorderTimeEntries(draggedEntry.order, draggedEntry.sourceId);
                  }}
                  onPointerCancel={(event) => {
                    reorderDrag.cancel();
                    event.currentTarget.focus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && reorderDrag.preview) {
                      event.preventDefault();
                      reorderDrag.cancel();
                      event.currentTarget.focus();
                    } else if (event.ctrlKey && event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveTimeEntry(entry.id, -1);
                    } else if (event.ctrlKey && event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveTimeEntry(entry.id, 1);
                    }
                  }}
                >
                  <ReorderGrip />
                </button>
                <label className="recipe-time-field" htmlFor={expressionId}>
                  <span className="visually-hidden">Minutes</span>
                  <input
                    aria-describedby={entry.error ? expressionErrorId : undefined}
                    aria-invalid={Boolean(entry.error)}
                    autoComplete="off"
                    id={expressionId}
                    inputMode="text"
                    type="text"
                    value={entry.expression}
                    onBlur={(event) => evaluateTimeEntry(entry.id, event.currentTarget.value)}
                    onChange={(event) => {
                      updateTimeEntry(entry.id, {
                        expression: event.target.value,
                        error: '',
                      });
                      setTimeEntriesError('');
                    }}
                  />
                  {entry.error && (
                    <span className="recipe-time-entry-error" id={expressionErrorId} role="alert">
                      {entry.error}
                    </span>
                  )}
                </label>
                <div className="recipe-time-type-actions">
                  <div className="recipe-time-type-field">
                    <SuggestionCellEditor
                      allowTabToSelectAdd={false}
                      describedBy={entry.typeError ? typeErrorId : undefined}
                      focusOnMount={false}
                      fitContent
                      invalid={Boolean(entry.typeError)}
                      label="Time Type"
                      onCancel={() => updateTimeEntry(entry.id, { typeError: '' })}
                      onCommit={(value) => commitTimeType(entry.id, value)}
                      onSelectSuggestion={(value) => {
                        void selectTimeType(entry.id, value);
                      }}
                      options={timeTypeOptions.map((option) => option.label)}
                      resetOnCancel
                      syncValue
                      value={
                        timeTypeOptions.find((option) => option.value === entry.timeTypeId)
                          ?.label ?? ''
                      }
                    />
                    <input name={`time_type_${entry.id}`} type="hidden" value={entry.timeTypeId} />
                    {entry.typeError && (
                      <span className="recipe-time-entry-error" id={typeErrorId} role="alert">
                        {entry.typeError}
                      </span>
                    )}
                  </div>
                  <div className="recipe-time-entry-actions">
                    <button
                      aria-label={`Remove time entry ${index + 1}`}
                      className="recipe-ingredient-set-action recipe-time-entry-remove"
                      title="Remove time entry"
                      type="button"
                      onClick={() => removeTimeEntry(entry.id)}
                    >
                      <X aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>
              </fieldset>
            );
          })}
          <button
            aria-label="Add time"
            className="recipe-time-add-row"
            type="button"
            onClick={addTimeEntry}
          >
            add time
          </button>
        </div>
        <p className="visually-hidden" role="status">
          {timeEntriesAnnouncement}
        </p>
        <div className="recipe-time-total-row">
          <label className="recipe-time-field" htmlFor="total-time">
            <span>Total</span>
            <output
              aria-label="Total time in minutes"
              id="total-time"
              aria-describedby={totalTimeExceedsLimit ? 'recipe-time-total-error' : undefined}
            >
              {totalTimeExceedsLimit
                ? 'Exceeds supported limit'
                : formatGroupedInteger(Number(totalTimeMinutes))}
            </output>
          </label>
        </div>
        {(timeEntriesError || totalTimeExceedsLimit) && (
          <p className="recipe-time-entry-error" id="recipe-time-total-error" role="alert">
            {timeEntriesError || 'Total time exceeds the supported whole-minute limit.'}
          </p>
        )}
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
            version={currentRecipeVersion ?? recipe.version}
          />
        )}
      </div>
    </>
  );
}
