'use client';

import { Calculator, ChevronRight, Merge, Plus, Salad, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { type IngredientDensity, resolveMeasureEquivalent } from '../../lib/recipes/density-rules';
import { volumeUnits, weightUnits } from '../../lib/recipes/measurement-rules';
import type { NutritionEquivalent, NutritionProfile } from '../../lib/recipes/nutrition-rules';
import { convertUnitAmount } from '../../lib/recipes/recipe-reader-rules';
import { manageIngredientCatalog } from '../actions/ingredient-catalog';
import { manageIngredientNutrition } from '../actions/ingredient-nutrition';
import { MeasuringCup } from '../measuring-cup-icon';
import { NutritionPane, type NutritionPaneSave } from '../nutrition/nutrition-pane';
import { Picklist, type PicklistOption } from '../picklist';
import styles from './ingredient-catalog-manager.module.css';

export type IngredientCatalogEntry = {
  id: string;
  name: string;
};

export type IngredientNutritionEntry = {
  ingredient_id: string;
  profile: NutritionProfile | null;
};

export type IngredientEquivalentEntry = {
  ingredient_id: string;
  equivalent: NutritionEquivalent;
};

type ThingOption = { id: string; label: string };

const MEASUREMENT_TYPE_OPTIONS: PicklistOption[] = [
  { value: 'count', label: 'Count' },
  { value: 'informal', label: 'Things' },
];
const VOLUME_UNIT_OPTIONS: PicklistOption[] = volumeUnits.map((unit) => ({
  value: unit.code,
  label: unit.abbreviation,
}));
const WEIGHT_UNIT_OPTIONS: PicklistOption[] = weightUnits.map((unit) => ({
  value: unit.code,
  label: unit.abbreviation,
}));

type CatalogAction = 'add' | 'rename' | 'merge' | 'delete';
type ManagerMode = 'merge' | 'delete';

function IngredientEquivalentPane({
  ingredientName,
  equivalent,
  density,
  thingOptions,
  isPending,
  onCancel,
  onClear,
  onSave,
}: {
  ingredientName: string;
  equivalent: NutritionEquivalent | null;
  density: IngredientDensity | null;
  thingOptions: ThingOption[];
  isPending: boolean;
  onCancel: () => void;
  onClear: () => void;
  onSave: (value: NutritionEquivalent) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [measurementType, setMeasurementType] = useState<'count' | 'informal'>(
    equivalent?.measurementType ?? 'count',
  );
  const [picklistValueId, setPicklistValueId] = useState(equivalent?.picklistValueId ?? '');
  const [volumeAmount, setVolumeAmount] = useState(
    equivalent?.volume ? String(equivalent.volume.amount) : '',
  );
  const [volumeUnitCode, setVolumeUnitCode] = useState(equivalent?.volume?.unitCode ?? 'cup');
  const [weightAmount, setWeightAmount] = useState(
    equivalent?.weight ? String(equivalent.weight.amount) : '',
  );
  const [weightUnitCode, setWeightUnitCode] = useState(equivalent?.weight?.unitCode ?? 'g');
  const [error, setError] = useState('');
  const [sourceDimension, setSourceDimension] = useState<'volume' | 'weight' | null>(() => {
    if (!density || (equivalent?.volume && equivalent.weight)) {
      return null;
    }
    return equivalent?.volume ? 'volume' : equivalent?.weight ? 'weight' : null;
  });
  const [openTooltip, setOpenTooltip] = useState<'volume' | 'weight' | null>(null);
  const tooltipId = useId();
  const hasLegacyPair = Boolean(density && equivalent?.volume && equivalent.weight);
  const selectedThing = thingOptions.find((option) => option.id === picklistValueId);
  const sourceAmount = sourceDimension === 'volume' ? volumeAmount : weightAmount;
  const parsedSourceAmount = Number(sourceAmount);
  const hasValidSourceAmount =
    sourceAmount.trim() !== '' && Number.isFinite(parsedSourceAmount) && parsedSourceAmount > 0;
  const resolvedEquivalent =
    density && sourceDimension && hasValidSourceAmount
      ? resolveMeasureEquivalent(
          {
            measurementType,
            picklistValueId: measurementType === 'informal' ? picklistValueId : null,
            picklistValue: measurementType === 'informal' ? (selectedThing?.label ?? null) : null,
            volume:
              sourceDimension === 'volume'
                ? { amount: parsedSourceAmount, unitCode: volumeUnitCode }
                : null,
            weight:
              sourceDimension === 'weight'
                ? { amount: parsedSourceAmount, unitCode: weightUnitCode }
                : null,
          },
          density,
          sourceDimension,
        )
      : null;
  const volumeIsDerived = Boolean(density && sourceDimension === 'weight' && hasValidSourceAmount);
  const weightIsDerived = Boolean(density && sourceDimension === 'volume' && hasValidSourceAmount);
  const displayedVolumeAmount =
    density && sourceDimension === 'weight'
      ? resolvedEquivalent?.volume
        ? String(
            convertUnitAmount(
              resolvedEquivalent.volume.amount,
              'volume',
              resolvedEquivalent.volume.unitCode,
              volumeUnitCode,
            ),
          )
        : ''
      : volumeAmount;
  const displayedWeightAmount =
    density && sourceDimension === 'volume'
      ? resolvedEquivalent?.weight
        ? String(
            convertUnitAmount(
              resolvedEquivalent.weight.amount,
              'weight',
              resolvedEquivalent.weight.unitCode,
              weightUnitCode,
            ),
          )
        : ''
      : weightAmount;
  const sourceChoiceRequired = hasLegacyPair && !sourceDimension;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function save() {
    if (sourceChoiceRequired) {
      setError('Choose which existing equivalent to keep as the source before saving.');
      return;
    }
    const enteredVolume = volumeAmount.trim()
      ? { amount: Number(volumeAmount), unitCode: volumeUnitCode }
      : null;
    const enteredWeight = weightAmount.trim()
      ? { amount: Number(weightAmount), unitCode: weightUnitCode }
      : null;
    const volume =
      density && sourceDimension
        ? sourceDimension === 'volume'
          ? enteredVolume
          : null
        : enteredVolume;
    const weight =
      density && sourceDimension
        ? sourceDimension === 'weight'
          ? enteredWeight
          : null
        : enteredWeight;
    if (
      (!volume && !weight) ||
      (volume && (!Number.isFinite(volume.amount) || volume.amount <= 0)) ||
      (weight && (!Number.isFinite(weight.amount) || weight.amount <= 0)) ||
      (measurementType === 'informal' && !selectedThing)
    ) {
      setError(
        'Enter at least one positive average volume or weight, and choose a Thing when needed.',
      );
      return;
    }
    setError('');
    onSave({
      measurementType,
      picklistValueId: measurementType === 'informal' ? (selectedThing?.id ?? null) : null,
      picklistValue: measurementType === 'informal' ? (selectedThing?.label ?? null) : null,
      volume,
      weight,
    });
  }

  function updateAmount(dimension: 'volume' | 'weight', value: string) {
    if (dimension === 'volume') {
      setVolumeAmount(value);
    } else {
      setWeightAmount(value);
    }
    const currentSourceAmount = sourceDimension === 'volume' ? volumeAmount : weightAmount;
    if (density && !currentSourceAmount.trim() && !sourceChoiceRequired) {
      setSourceDimension(dimension);
    }
    setOpenTooltip(null);
  }

  function renderEquivalentMeasure(dimension: 'volume' | 'weight') {
    const isVolume = dimension === 'volume';
    const label = isVolume ? 'Volume' : 'Weight';
    const amount = isVolume ? displayedVolumeAmount : displayedWeightAmount;
    const unitCode = isVolume ? volumeUnitCode : weightUnitCode;
    const unitOptions = isVolume ? VOLUME_UNIT_OPTIONS : WEIGHT_UNIT_OPTIONS;
    const isDerived = isVolume ? volumeIsDerived : weightIsDerived;
    const isReadOnly = isDerived || sourceChoiceRequired;
    const statusId = `${tooltipId}-${dimension}-status`;
    const tooltipIsOpen = openTooltip === dimension;
    return (
      <>
        <div
          className={`${styles.equivalentAmountWrap}${isDerived ? ` ${styles.equivalentAmountDerived}` : ''}`}
          data-tooltip-open={tooltipIsOpen || undefined}
        >
          <input
            aria-describedby={isDerived ? statusId : undefined}
            aria-label={`Average ${label.toLocaleLowerCase()} amount`}
            inputMode="decimal"
            min="0"
            readOnly={isReadOnly}
            step="any"
            type="number"
            value={amount}
            onChange={(event) => updateAmount(dimension, event.currentTarget.value)}
          />
          {isDerived && (
            <>
              <button
                aria-describedby={statusId}
                aria-expanded={tooltipIsOpen}
                aria-label="Derived from density"
                className={styles.equivalentDerivedIndicator}
                title="Derived from density"
                type="button"
                onClick={() =>
                  setOpenTooltip((current) => (current === dimension ? null : dimension))
                }
              >
                <Calculator aria-hidden="true" size={14} />
              </button>
              <span className="visually-hidden" id={statusId} role="status">
                Derived from density
              </span>
              <span className={styles.equivalentDerivedTooltip} role="tooltip">
                Derived from trusted density.
              </span>
            </>
          )}
        </div>
        <Picklist
          className={styles.equivalentPicklist}
          label={`Average ${label.toLocaleLowerCase()} unit`}
          options={unitOptions}
          scope="ingredient-equivalent"
          value={unitCode}
          onSelect={(value) => (isVolume ? setVolumeUnitCode(value) : setWeightUnitCode(value))}
        />
        {isDerived && (
          <span className="visually-hidden">
            Derived {label.toLocaleLowerCase()} unit: {unitCode}
          </span>
        )}
      </>
    );
  }

  return (
    <dialog
      aria-labelledby="ingredient-equivalent-title"
      className={styles.equivalentDialog}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <form
        className={styles.equivalentForm}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className={styles.paneHeading}>
          <div className={styles.equivalentHeadingText}>
            <h2 className={styles.equivalentTitle} id="ingredient-equivalent-title">
              <MeasuringCup className={styles.equivalentTitleIcon} size={22} />
              <span className="visually-hidden">Measure equivalent for </span>
              <span className={styles.equivalentTitleText}>{ingredientName}</span>
            </h2>
            <p className={styles.equivalentSubtitle}>Average measures</p>
          </div>
          <button aria-label="Close" className={styles.iconButton} type="button" onClick={onCancel}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <p className={styles.note}>
          Enter the average volume and/or weight for one Count or Things unit. When trusted density
          exists, enter one dimension and the other is calculated. Without density, both dimensions
          may be entered.
        </p>
        {hasLegacyPair && (
          <fieldset className={styles.equivalentSourceChoice}>
            <legend>Existing values with trusted density</legend>
            <span>
              Choose which dimension to keep as the source; the other will be recalculated.
            </span>
            <label>
              <input
                checked={sourceDimension === 'volume'}
                name={`${tooltipId}-source`}
                type="radio"
                value="volume"
                onChange={() => setSourceDimension('volume')}
              />
              Use Volume as source
            </label>
            <label>
              <input
                checked={sourceDimension === 'weight'}
                name={`${tooltipId}-source`}
                type="radio"
                value="weight"
                onChange={() => setSourceDimension('weight')}
              />
              Use Weight as source
            </label>
          </fieldset>
        )}
        <div className={styles.equivalentField}>
          <span>Recipe measurement</span>
          <Picklist
            className={styles.equivalentPicklist}
            label="Recipe measurement"
            options={MEASUREMENT_TYPE_OPTIONS}
            scope="ingredient-equivalent"
            value={measurementType}
            onSelect={(value) => setMeasurementType(value as 'count' | 'informal')}
          />
        </div>
        {measurementType === 'informal' && (
          <div className={styles.equivalentField}>
            <span>Things unit</span>
            <Picklist
              className={styles.equivalentPicklist}
              invalid={Boolean(error) && !selectedThing}
              label="Things unit"
              measureLabel="Choose a Things unit"
              options={thingOptions.map((option) => ({ value: option.id, label: option.label }))}
              scope="ingredient-equivalent"
              value={picklistValueId}
              onSelect={setPicklistValueId}
            >
              {selectedThing?.label ?? 'Choose a Things unit'}
            </Picklist>
          </div>
        )}
        <fieldset className={styles.equivalentGroup}>
          <legend>Average volume for one unit</legend>
          {renderEquivalentMeasure('volume')}
        </fieldset>
        <fieldset className={styles.equivalentGroup}>
          <legend>Average weight for one unit</legend>
          {renderEquivalentMeasure('weight')}
        </fieldset>
        {error && (
          <p className={styles.equivalentError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.equivalentActions}>
          {equivalent && (
            <button disabled={isPending} type="button" onClick={onClear}>
              Clear
            </button>
          )}
          <span />
          <button disabled={isPending} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button disabled={isPending} type="submit">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function IngredientCatalogManager({
  initialIngredients,
  initialRevision,
  referenceCounts,
  initialNutrition,
  initialEquivalents,
  initialDensities,
  thingOptions,
}: {
  initialIngredients: IngredientCatalogEntry[];
  initialRevision: number;
  referenceCounts: Record<string, number>;
  initialNutrition: IngredientNutritionEntry[];
  initialEquivalents: IngredientEquivalentEntry[];
  initialDensities: {
    ingredient_id: string;
    volume_amount: number;
    volume_unit_code: string;
    weight_amount: number;
    weight_unit_code: string;
  }[];
  thingOptions: ThingOption[];
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [revision, setRevision] = useState(initialRevision);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManagerMode>('merge');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addName, setAddName] = useState('');
  const [search, setSearch] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [mergeCounterpartId, setMergeCounterpartId] = useState('');
  const [mergeKeepId, setMergeKeepId] = useState('');
  const [panePosition, setPanePosition] = useState<{
    top: number | null;
    bottom: number | null;
    left: number;
    maxHeight: number;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [nutritionIngredientId, setNutritionIngredientId] = useState<string | null>(null);
  const [equivalentIngredientId, setEquivalentIngredientId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTriggerRef = useRef<HTMLButtonElement>(null);
  const nutritionTriggerRef = useRef<HTMLButtonElement>(null);
  const equivalentTriggerRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIngredients(initialIngredients);
    setRevision(initialRevision);
  }, [initialIngredients, initialRevision]);

  useEffect(() => {
    if (editingId) renameInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    function cancelOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && renameInputRef.current?.contains(target)) return;
      setEditingId(null);
    }
    document.addEventListener('pointerdown', cancelOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', cancelOnOutsidePointer);
  }, [editingId]);

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const rows = [...ingredients].sort(
    (left, right) => collator.compare(left.name, right.name) || left.id.localeCompare(right.id),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const isWholeWordSearch = /\s$/.test(search);
  const wholeWordPattern = isWholeWordSearch
    ? new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`,
        'u',
      )
    : null;
  const filteredRows = normalizedSearch
    ? rows.filter((ingredient) =>
        wholeWordPattern
          ? wholeWordPattern.test(ingredient.name.toLocaleLowerCase())
          : ingredient.name.toLocaleLowerCase().includes(normalizedSearch),
      )
    : rows;
  const canAddSearch = normalizedSearch !== '' && filteredRows.length === 0;
  const searchAddName = search.replace(/\s+$/, '');
  const selectedIngredient = rows.find((ingredient) => ingredient.id === selectedId) ?? null;
  const nutritionIngredient =
    rows.find((ingredient) => ingredient.id === nutritionIngredientId) ?? null;
  const equivalentIngredient =
    rows.find((ingredient) => ingredient.id === equivalentIngredientId) ?? null;
  const nutritionByIngredient = new Map(
    initialNutrition.map((entry) => [entry.ingredient_id, entry.profile]),
  );
  const equivalentByIngredient = new Map(
    initialEquivalents.map((entry) => [entry.ingredient_id, entry.equivalent]),
  );
  const densityByIngredient = new Map(
    initialDensities.map((entry) => [
      entry.ingredient_id,
      {
        volumeAmount: entry.volume_amount,
        volumeUnitCode: entry.volume_unit_code,
        weightAmount: entry.weight_amount,
        weightUnitCode: entry.weight_unit_code,
      },
    ]),
  );
  const selectedRecipeCount = selectedIngredient
    ? (referenceCounts[selectedIngredient.id] ?? 0)
    : 0;

  useLayoutEffect(() => {
    if (!selectedId) return;
    const pane = paneRef.current;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-ingredient-row]') ?? [],
    ).find((item) => item.dataset.ingredientRow === selectedId);
    if (!pane || !row) return;
    const activePane = pane;
    const activeRow = row;

    function updatePanePosition() {
      if (!window.matchMedia('(max-width: 760px)').matches) {
        setPanePosition(null);
        return;
      }

      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const rowBounds = activeRow.getBoundingClientRect();
      const paneBounds = activePane.getBoundingClientRect();
      const spaceAbove = Math.max(0, rowBounds.top - viewportTop - 8);
      const spaceBelow = Math.max(0, viewportBottom - rowBounds.bottom - 8);
      const placeBelow = spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, (placeBelow ? spaceBelow : spaceAbove) - 16);

      setPanePosition({
        top: placeBelow ? rowBounds.bottom + 8 : null,
        bottom: placeBelow ? null : viewportBottom - rowBounds.top + 8,
        left: Math.max(
          viewportLeft + 8,
          Math.min(
            rowBounds.right - paneBounds.width,
            viewportLeft + viewportWidth - paneBounds.width - 8,
          ),
        ),
        maxHeight,
      });
    }

    updatePanePosition();
    window.addEventListener('resize', updatePanePosition);
    window.addEventListener('scroll', updatePanePosition, true);
    window.visualViewport?.addEventListener('resize', updatePanePosition);
    window.visualViewport?.addEventListener('scroll', updatePanePosition);
    return () => {
      window.removeEventListener('resize', updatePanePosition);
      window.removeEventListener('scroll', updatePanePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePanePosition);
      window.visualViewport?.removeEventListener('scroll', updatePanePosition);
    };
  }, [selectedId]);

  const closePane = useCallback((restoreFocus = true) => {
    setSelectedId(null);
    setPanePosition(null);
    setReplacementId('');
    setMergeCounterpartId('');
    setMergeKeepId('');
    if (restoreFocus) requestAnimationFrame(() => paneTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || paneRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('[data-picklist-scope="ingredient-catalog-manager"]')
      ) {
        return;
      }
      closePane(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [closePane, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const searchInput = searchInputRef.current;
        if (event.target === searchInput && searchInput?.value) {
          setSearch('');
          return;
        }
        closePane();
      }
    }
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [closePane, selectedId]);

  function submitMutation(
    action: CatalogAction,
    fields: { name: string; value: string }[],
    successMessage: string,
    afterSaved?: () => void,
  ) {
    const formData = new FormData();
    formData.set('action', action);
    formData.set('revision', String(revision));
    for (const field of fields) formData.append(field.name, field.value);

    startTransition(async () => {
      const result = await manageIngredientCatalog({}, formData);
      setStatus(result.status === 'saved' ? successMessage : (result.message ?? ''));
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        afterSaved?.();
        router.refresh();
      } else if (result.status === 'conflict') {
        router.refresh();
      }
    });
  }

  function addIngredient(event: FormEvent<HTMLFormElement>, name = addName) {
    event.preventDefault();
    addIngredientByName(name);
  }

  function addIngredientByName(name: string) {
    if (!name.trim()) return;
    submitMutation('add', [{ name: 'name', value: name }], 'Ingredient added.', () => {
      setAddName('');
    });
  }

  function saveRename(event: FormEvent<HTMLFormElement>, ingredient: IngredientCatalogEntry) {
    event.preventDefault();
    if (!editName.trim()) return;
    submitMutation(
      'rename',
      [
        { name: 'ingredient_id', value: ingredient.id },
        { name: 'name', value: editName },
      ],
      'Ingredient renamed.',
      () => setEditingId(null),
    );
  }

  function openPane(
    ingredient: IngredientCatalogEntry,
    nextMode: ManagerMode,
    trigger: HTMLButtonElement,
  ) {
    paneTriggerRef.current = trigger;
    setSelectedId(ingredient.id);
    setMode(nextMode);
    setReplacementId('');
    setMergeCounterpartId('');
    setMergeKeepId('');
  }

  function closeNutritionPane(restoreFocus = true) {
    setNutritionIngredientId(null);
    if (restoreFocus) requestAnimationFrame(() => nutritionTriggerRef.current?.focus());
  }

  function closeEquivalentPane(restoreFocus = true) {
    setEquivalentIngredientId(null);
    if (restoreFocus) requestAnimationFrame(() => equivalentTriggerRef.current?.focus());
  }

  function saveNutrition(value: NutritionPaneSave) {
    if (!value.basis || value.values.calories === undefined) {
      setStatus('Enter a serving size and Calories before saving.');
      return;
    }
    const formData = new FormData();
    formData.set('action', 'profile_set');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', nutritionIngredientId ?? '');
    formData.set(
      'profile',
      JSON.stringify({
        servingSize: value.basis,
        nutrients: value.values,
      }),
    );
    startTransition(async () => {
      const result = await manageIngredientNutrition({}, formData);
      setStatus(
        result.status === 'saved'
          ? (result.message ?? 'Nutrition saved.')
          : (result.message ?? 'Nutrition could not be saved.'),
      );
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        closeNutritionPane(false);
        router.refresh();
      }
    });
  }

  function clearNutrition() {
    if (!nutritionIngredient || !nutritionByIngredient.get(nutritionIngredient.id)) {
      closeNutritionPane();
      return;
    }
    const formData = new FormData();
    formData.set('action', 'profile_remove');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', nutritionIngredient.id);
    startTransition(async () => {
      const result = await manageIngredientNutrition({}, formData);
      setStatus(
        result.status === 'saved'
          ? (result.message ?? 'Nutrition removed.')
          : (result.message ?? 'Nutrition could not be removed.'),
      );
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        closeNutritionPane(false);
        router.refresh();
      }
    });
  }

  function saveEquivalent(value: NutritionEquivalent) {
    if (!equivalentIngredientId) return;
    const formData = new FormData();
    formData.set('action', 'equivalent_set');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', equivalentIngredientId);
    formData.set('equivalent', JSON.stringify(value));
    startTransition(async () => {
      const result = await manageIngredientNutrition({}, formData);
      setStatus(
        result.status === 'saved'
          ? (result.message ?? 'Measure equivalent saved.')
          : (result.message ?? 'Measure equivalent could not be saved.'),
      );
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        closeEquivalentPane(false);
        router.refresh();
      }
    });
  }

  function clearEquivalent() {
    if (!equivalentIngredient) {
      closeEquivalentPane();
      return;
    }
    const formData = new FormData();
    formData.set('action', 'equivalent_remove');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', equivalentIngredient.id);
    startTransition(async () => {
      const result = await manageIngredientNutrition({}, formData);
      setStatus(
        result.status === 'saved'
          ? (result.message ?? 'Measure equivalent removed.')
          : (result.message ?? 'Measure equivalent could not be removed.'),
      );
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        closeEquivalentPane(false);
        router.refresh();
      }
    });
  }

  function renderRow(ingredient: IngredientCatalogEntry) {
    return (
      <li className={styles.row} data-ingredient-row={ingredient.id} key={ingredient.id}>
        {editingId === ingredient.id ? (
          <form className={styles.inlineEditor} onSubmit={(event) => saveRename(event, ingredient)}>
            <input
              aria-label={`Rename ${ingredient.name}`}
              className={styles.inlineInput}
              maxLength={160}
              ref={renameInputRef}
              required
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditingId(null);
              }}
            />
          </form>
        ) : (
          <button
            aria-label={`Edit ${ingredient.name}`}
            className={styles.valueButton}
            disabled={isPending || Boolean(selectedId)}
            type="button"
            onClick={() => {
              setEditingId(ingredient.id);
              setEditName(ingredient.name);
            }}
          >
            {ingredient.name}
          </button>
        )}
        <div className={styles.rowActions}>
          <button
            aria-label={`Nutrition for ${ingredient.name}`}
            className={styles.iconButton}
            disabled={
              isPending ||
              Boolean(editingId) ||
              Boolean(selectedId) ||
              Boolean(equivalentIngredientId)
            }
            title="Nutrition"
            type="button"
            onClick={(event) => {
              nutritionTriggerRef.current = event.currentTarget;
              setNutritionIngredientId(ingredient.id);
            }}
          >
            <Salad aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={`Measure equivalent for ${ingredient.name}`}
            className={styles.iconButton}
            disabled={
              isPending ||
              Boolean(editingId) ||
              Boolean(selectedId) ||
              Boolean(nutritionIngredientId)
            }
            title="Measure equivalent"
            type="button"
            onClick={(event) => {
              equivalentTriggerRef.current = event.currentTarget;
              setEquivalentIngredientId(ingredient.id);
            }}
          >
            <MeasuringCup size={18} />
          </button>
          <button
            aria-label={`Merge ${ingredient.name}`}
            className={styles.iconButton}
            disabled={isPending || Boolean(editingId)}
            title="Merge with another ingredient"
            type="button"
            onClick={(event) => openPane(ingredient, 'merge', event.currentTarget)}
          >
            <Merge aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={`Delete ${ingredient.name}`}
            className={styles.iconButton}
            disabled={isPending || Boolean(editingId)}
            title="Delete ingredient"
            type="button"
            onClick={(event) => openPane(ingredient, 'delete', event.currentTarget)}
          >
            <Trash2 aria-hidden="true" size={18} />
          </button>
        </div>
      </li>
    );
  }

  function renderPane() {
    if (!selectedIngredient) return null;
    const isMerge = mode === 'merge';
    const paneLabel = isMerge
      ? `Merge ${selectedIngredient.name}`
      : `Delete ${selectedIngredient.name}`;
    const options = rows
      .filter((ingredient) => ingredient.id !== selectedIngredient.id)
      .map((ingredient) => ({ value: ingredient.id, label: ingredient.name }));
    const mergeCounterpart = rows.find((ingredient) => ingredient.id === mergeCounterpartId);

    return (
      <section
        aria-label={paneLabel}
        className={`${styles.pane} ${isMerge ? styles.mergePane : ''}`}
        ref={paneRef}
        style={
          panePosition
            ? {
                top: panePosition.top ?? 'auto',
                bottom: panePosition.bottom ?? 'auto',
                left: panePosition.left,
                right: 'auto',
                maxHeight: panePosition.maxHeight,
              }
            : undefined
        }
      >
        <div className={styles.paneHeading}>
          <h3>{paneLabel}</h3>
          <button
            aria-label="Close"
            className={styles.iconButton}
            type="button"
            onClick={() => closePane()}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className={styles.form}>
          <p className={styles.note}>
            Used by {selectedRecipeCount} {selectedRecipeCount === 1 ? 'recipe' : 'recipes'}.
            {selectedRecipeCount > 0 && ' Recipe rows and instruction links stay in place.'}
          </p>
          {isMerge ? (
            <>
              <div className={styles.field}>
                <span>{`Merge ${selectedIngredient.name} with`}</span>
                <Picklist
                  className={styles.mergePicklist}
                  label={`Merge ${selectedIngredient.name} with`}
                  measureLabel="Ingredient"
                  menuClassName={styles.mergePicklistMenu}
                  options={options}
                  scope="ingredient-catalog-manager"
                  sizeToContent={false}
                  value={mergeCounterpartId}
                  onSelect={(value) => {
                    setMergeCounterpartId(value);
                    setMergeKeepId('');
                  }}
                >
                  {mergeCounterpart?.name ?? 'Choose an ingredient'}
                </Picklist>
              </div>
              <fieldset className={styles.keepChoices}>
                <legend>Keep as</legend>
                <button
                  aria-pressed={mergeKeepId === selectedIngredient.id}
                  className={styles.keepButton}
                  disabled={!mergeCounterpart || isPending}
                  type="button"
                  onClick={() => setMergeKeepId(selectedIngredient.id)}
                >
                  {selectedIngredient.name}
                </button>
                <button
                  aria-pressed={mergeKeepId === mergeCounterpart?.id}
                  className={styles.keepButton}
                  disabled={!mergeCounterpart || isPending}
                  type="button"
                  onClick={() => mergeCounterpart && setMergeKeepId(mergeCounterpart.id)}
                >
                  {mergeCounterpart?.name ?? 'ingredient'}
                </button>
              </fieldset>
              <button
                className={styles.saveButton}
                disabled={isPending || !mergeCounterpart || !mergeKeepId}
                type="button"
                onClick={() => {
                  const sourceId =
                    mergeKeepId === selectedIngredient.id
                      ? mergeCounterpartId
                      : selectedIngredient.id;
                  submitMutation(
                    'merge',
                    [
                      { name: 'ingredient_id', value: sourceId },
                      { name: 'replacement_id', value: mergeKeepId },
                    ],
                    'Ingredients merged.',
                    () => closePane(false),
                  );
                }}
              >
                Merge
              </button>
            </>
          ) : (
            <>
              {selectedRecipeCount > 0 && (
                <div className={styles.field}>
                  <span>Replace with</span>
                  <Picklist
                    className={styles.replacementPicklist}
                    label="Replace with"
                    measureLabel="Ingredient"
                    options={options}
                    scope="ingredient-catalog-manager"
                    sizeToContent={false}
                    value={replacementId}
                    onSelect={setReplacementId}
                  >
                    {options.find((option) => option.value === replacementId)?.label ??
                      'Choose an ingredient'}
                  </Picklist>
                </div>
              )}
              <button
                className={styles.deleteButton}
                disabled={isPending || (selectedRecipeCount > 0 && !replacementId)}
                type="button"
                onClick={() => {
                  submitMutation(
                    'delete',
                    [
                      { name: 'ingredient_id', value: selectedIngredient.id },
                      { name: 'replacement_id', value: replacementId },
                    ],
                    'Ingredient deleted.',
                    () => closePane(false),
                  );
                }}
              >
                Delete ingredient
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ingredient-catalog-title"
      className="settings-section ingredient-catalog-section settings-accordion-section"
    >
      <h2 className={styles.sectionHeading}>
        <button
          aria-controls="ingredient-catalog-editor"
          aria-expanded={isExpanded}
          className={styles.sectionToggle}
          id="ingredient-catalog-title"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <ChevronRight aria-hidden="true" className={styles.sectionChevron} size={18} />
          <span className={styles.sectionLabel}>Ingredients</span>
        </button>
      </h2>
      <div hidden={!isExpanded} id="ingredient-catalog-editor">
        <div className={styles.manager}>
          <div className={styles.toolbar}>
            <div className={styles.searchControls}>
              <label className={styles.searchField}>
                <Search aria-hidden="true" size={18} />
                <input
                  aria-label="Search ingredients"
                  autoComplete="off"
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canAddSearch) {
                      event.preventDefault();
                      addIngredientByName(searchAddName);
                    } else if (event.key === 'Escape' && search) {
                      event.preventDefault();
                      setSearch('');
                    }
                  }}
                />
              </label>
              <button
                aria-label="Clear ingredient search"
                className={styles.clearButton}
                disabled={!search}
                title="Clear ingredient search"
                type="button"
                onClick={() => setSearch('')}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <span>
              {normalizedSearch
                ? `${filteredRows.length} of ${rows.length} ingredients`
                : `${rows.length} ingredients`}
            </span>
          </div>
          <div className={styles.columns}>
            <div className={styles.listColumn}>
              <ol aria-label="Ingredients" className={styles.list} ref={listRef}>
                {filteredRows.map(renderRow)}
              </ol>
              {filteredRows.length === 0 && !canAddSearch && (
                <p className={styles.emptyState}>No ingredients yet.</p>
              )}
              {canAddSearch ? (
                <form
                  className={`${styles.addRow} ${styles.searchAddRow}`}
                  onSubmit={(event) => addIngredient(event, searchAddName)}
                >
                  <button className={styles.addButton} disabled={isPending} type="submit">
                    <span>add {searchAddName}</span>
                  </button>
                </form>
              ) : (
                <form className={styles.addRow} onSubmit={addIngredient}>
                  <input
                    aria-label="Add ingredient"
                    className={styles.addInput}
                    maxLength={160}
                    placeholder="add ingredient"
                    required
                    value={addName}
                    onChange={(event) => setAddName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setAddName('');
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  {addName.trim() && (
                    <button
                      aria-label={`Add ${addName.trim()}`}
                      className={styles.addActionButton}
                      disabled={isPending}
                      title={`Add ${addName.trim()}`}
                      type="submit"
                    >
                      <Plus aria-hidden="true" size={18} />
                    </button>
                  )}
                </form>
              )}
            </div>
            {renderPane()}
            {nutritionIngredient && (
              <NutritionPane
                mode="settings"
                title={nutritionIngredient.name}
                profile={nutritionByIngredient.get(nutritionIngredient.id) ?? null}
                onCancel={() => closeNutritionPane()}
                onClear={clearNutrition}
                onSave={saveNutrition}
              />
            )}
            {equivalentIngredient && (
              <IngredientEquivalentPane
                ingredientName={equivalentIngredient.name}
                equivalent={equivalentByIngredient.get(equivalentIngredient.id) ?? null}
                density={densityByIngredient.get(equivalentIngredient.id) ?? null}
                thingOptions={thingOptions}
                isPending={isPending}
                onCancel={() => closeEquivalentPane()}
                onClear={clearEquivalent}
                onSave={saveEquivalent}
              />
            )}
          </div>
          {(isPending || status) && (
            <p aria-live="polite" className={styles.status} role="status">
              {isPending ? 'Saving...' : status}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
