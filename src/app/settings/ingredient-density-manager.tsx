'use client';

import { Check, ChevronRight, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  formatQuantity,
  parseQuantityInput,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';
import { convertUnitAmount } from '../../lib/recipes/recipe-reader-rules';
import { manageIngredientDensity } from '../actions/ingredient-density';
import { Picklist, type PicklistOption } from '../picklist';
import type { IngredientCatalogEntry } from './ingredient-catalog-manager';
import styles from './ingredient-density-manager.module.css';

export type IngredientDensityEntry = {
  ingredient_id: string;
  ingredient_name: string;
  volume_amount: number;
  volume_unit_code: string;
  weight_amount: number;
  weight_unit_code: string;
};

type DensityDraft = {
  ingredientId: string;
  ingredientQuery: string;
  volumeAmount: string;
  volumeUnitCode: string;
  weightAmount: string;
  weightUnitCode: string;
};

const volumeOptions: PicklistOption[] = volumeUnits.map((unit) => ({
  value: unit.code,
  label: unit.abbreviation,
  group: unit.system === 'us_customary' ? 'US customary' : 'Metric',
}));
const weightOptions: PicklistOption[] = weightUnits.map((unit) => ({
  value: unit.code,
  label: unit.abbreviation,
  group: unit.system === 'us_customary' ? 'US customary' : 'Metric',
}));
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const picklistScope = 'ingredient-density-manager';

function createDraft(ingredientId = '', ingredientQuery = ''): DensityDraft {
  return {
    ingredientId,
    ingredientQuery,
    volumeAmount: '1',
    volumeUnitCode: 'cup',
    weightAmount: '',
    weightUnitCode: 'g',
  };
}

function formatMeasurement(amount: number, unitCode: string, dimension: 'volume' | 'weight') {
  const units = dimension === 'volume' ? volumeUnits : weightUnits;
  const unit = units.find((candidate) => candidate.code === unitCode);
  return `${formatQuantity(amount, unit?.system)} ${unit?.abbreviation ?? unitCode}`;
}

function formatDensityValue(
  volumeAmount: number,
  volumeUnitCode: string,
  weightAmount: number,
  weightUnitCode: string,
) {
  try {
    const volumeMilliliters = convertUnitAmount(volumeAmount, 'volume', volumeUnitCode, 'ml');
    const weightGrams = convertUnitAmount(weightAmount, 'weight', weightUnitCode, 'g');
    return `${(weightGrams / volumeMilliliters).toFixed(3)} g/mL`;
  } catch {
    return '';
  }
}

function densityPreview(draft: DensityDraft): string {
  const volume = parseQuantityInput(draft.volumeAmount);
  const weight = parseQuantityInput(draft.weightAmount);
  if (!volume || !weight || volume.maximum !== null || weight.maximum !== null) {
    return '';
  }
  return formatDensityValue(
    volume.minimum,
    draft.volumeUnitCode,
    weight.minimum,
    draft.weightUnitCode,
  );
}

function formatDensity(density: IngredientDensityEntry): string {
  return formatDensityValue(
    density.volume_amount,
    density.volume_unit_code,
    density.weight_amount,
    density.weight_unit_code,
  );
}

export function IngredientDensityManager({
  initialIngredients,
  initialDensities,
  initialRevision,
}: {
  initialIngredients: IngredientCatalogEntry[];
  initialDensities: IngredientDensityEntry[];
  initialRevision: number;
}) {
  const router = useRouter();
  const errorId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [densities, setDensities] = useState(initialDensities);
  const [revision, setRevision] = useState(initialRevision);
  const [draft, setDraft] = useState<DensityDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [ingredientListOpen, setIngredientListOpen] = useState(false);
  const [activeIngredientIndex, setActiveIngredientIndex] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const isEditingDraft = draft !== null;
  const editorRowRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const ingredientSearchRef = useRef<HTMLInputElement>(null);
  const volumeAmountRef = useRef<HTMLInputElement>(null);
  const weightAmountRef = useRef<HTMLInputElement>(null);
  const saveDraftRef = useRef<(restoreFocus?: boolean) => void>(() => {});
  const closeEditorRef = useRef<(restoreFocus?: boolean) => void>(() => {});
  const focusReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setDensities(initialDensities);
    setRevision(initialRevision);
  }, [initialDensities, initialRevision]);

  const ingredientById = new Map(
    initialIngredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const configuredIds = new Set(densities.map((density) => density.ingredient_id));
  const availableIngredients = [...initialIngredients]
    .filter((ingredient) => !configuredIds.has(ingredient.id))
    .sort((left, right) => collator.compare(left.name, right.name));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredDensities = densities
    .filter((density) =>
      `${density.ingredient_name} ${formatDensity(density)}`
        .toLocaleLowerCase()
        .includes(normalizedSearch),
    )
    .sort(
      (left, right) =>
        collator.compare(left.ingredient_name, right.ingredient_name) ||
        left.ingredient_id.localeCompare(right.ingredient_id),
    );
  const matchingAvailableIngredients = normalizedSearch
    ? availableIngredients
        .filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(normalizedSearch))
        .sort(
          (left, right) =>
            Number(!left.name.toLocaleLowerCase().startsWith(normalizedSearch)) -
              Number(!right.name.toLocaleLowerCase().startsWith(normalizedSearch)) ||
            collator.compare(left.name, right.name),
        )
    : [];
  const suggestedIngredient = matchingAvailableIngredients[0];
  const ingredientMatches = draft
    ? availableIngredients
        .filter((ingredient) =>
          ingredient.name
            .toLocaleLowerCase()
            .includes(draft.ingredientQuery.trim().toLocaleLowerCase()),
        )
        .slice(0, 3)
    : [];

  const focusedIngredientId = draft?.ingredientId;
  useEffect(() => {
    if (focusedIngredientId === undefined) return;
    if (editingId || focusedIngredientId) {
      volumeAmountRef.current?.focus();
    } else {
      ingredientSearchRef.current?.focus();
    }
  }, [focusedIngredientId, editingId]);

  useEffect(() => {
    if (!isEditingDraft) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRowRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(`[data-picklist-scope="${picklistScope}"]`)) {
        return;
      }
      if (editingId === null) {
        closeEditorRef.current(false);
        return;
      }
      saveDraftRef.current(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const ingredientSearch = ingredientSearchRef.current;
        if (event.target === ingredientSearch && ingredientSearch?.value) {
          event.stopImmediatePropagation();
          setDraft((current) =>
            current ? { ...current, ingredientId: '', ingredientQuery: '' } : current,
          );
          setIngredientListOpen(false);
          setActiveIngredientIndex(0);
          setError('');
          return;
        }
        event.stopImmediatePropagation();
        closeEditorRef.current();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [editingId, isEditingDraft]);

  function beginAdd(trigger: HTMLButtonElement, ingredientId = '', ingredientName = '') {
    if (!availableIngredients.length) {
      setStatus('There are no ingredients available to configure.');
      return;
    }
    setEditingId(null);
    setConfirmRemoveId(null);
    setError('');
    setStatus('');
    setIngredientListOpen(false);
    focusReturnRef.current = trigger;
    setDraft(createDraft(ingredientId, ingredientName));
  }

  function beginEdit(density: IngredientDensityEntry, trigger: HTMLButtonElement) {
    setEditingId(density.ingredient_id);
    setConfirmRemoveId(null);
    setError('');
    setStatus('');
    focusReturnRef.current = trigger;
    setDraft({
      ingredientId: density.ingredient_id,
      ingredientQuery: density.ingredient_name,
      volumeAmount: String(density.volume_amount),
      volumeUnitCode: density.volume_unit_code,
      weightAmount: String(density.weight_amount),
      weightUnitCode: density.weight_unit_code,
    });
  }

  function closeEditor(restoreFocus = true) {
    setDraft(null);
    setEditingId(null);
    setIngredientListOpen(false);
    setError('');
    if (restoreFocus) {
      requestAnimationFrame(() => {
        if (focusReturnRef.current?.isConnected) {
          focusReturnRef.current.focus();
        } else {
          searchInputRef.current?.focus();
        }
      });
    }
  }
  closeEditorRef.current = closeEditor;

  function updateDraft(update: Partial<DensityDraft>) {
    setDraft((current) => (current ? { ...current, ...update } : current));
    setError('');
  }

  function chooseIngredient(ingredient: IngredientCatalogEntry) {
    updateDraft({ ingredientId: ingredient.id, ingredientQuery: ingredient.name });
    setIngredientListOpen(false);
    setActiveIngredientIndex(0);
  }

  function saveDraft(restoreFocus = true) {
    if (!draft) return;
    const volumeQuantity = parseQuantityInput(draft.volumeAmount);
    const weightQuantity = parseQuantityInput(draft.weightAmount);
    const volumeAmount =
      volumeQuantity && volumeQuantity.maximum === null ? volumeQuantity.minimum : null;
    const weightAmount =
      weightQuantity && weightQuantity.maximum === null ? weightQuantity.minimum : null;
    if (!draft.ingredientId) {
      setError('Choose an existing ingredient.');
      return;
    }
    if (volumeAmount === null || weightAmount === null) {
      setError('Enter positive finite amounts for both Volume and Weight.');
      return;
    }

    const formData = new FormData();
    formData.set('action', 'set');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', draft.ingredientId);
    formData.set('volume_amount', draft.volumeAmount);
    formData.set('volume_unit_code', draft.volumeUnitCode);
    formData.set('weight_amount', draft.weightAmount);
    formData.set('weight_unit_code', draft.weightUnitCode);
    startTransition(async () => {
      const result = await manageIngredientDensity({}, formData);
      setStatus(result.message ?? '');
      if (result.status === 'saved') {
        const ingredient = ingredientById.get(draft.ingredientId);
        if (ingredient) {
          const nextDensity: IngredientDensityEntry = {
            ingredient_id: draft.ingredientId,
            ingredient_name: ingredient.name,
            volume_amount: volumeAmount,
            volume_unit_code: draft.volumeUnitCode,
            weight_amount: weightAmount,
            weight_unit_code: draft.weightUnitCode,
          };
          setDensities((current) => [
            ...current.filter((density) => density.ingredient_id !== draft.ingredientId),
            nextDensity,
          ]);
        }
        setRevision(result.revision ?? revision + 1);
        closeEditor(restoreFocus);
        router.refresh();
      } else if (result.status === 'conflict') {
        router.refresh();
      } else {
        setError(result.message ?? 'Trusted density could not be updated.');
      }
    });
  }
  saveDraftRef.current = saveDraft;

  function handleAmountKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    dimension: 'volume' | 'weight',
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeEditor();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (dimension === 'volume') {
        weightAmountRef.current?.focus();
      } else {
        saveDraft();
      }
    }
  }

  function handleIngredientKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && ingredientMatches.length > 0) {
      event.preventDefault();
      setIngredientListOpen(true);
      setActiveIngredientIndex((current) => (current + 1) % ingredientMatches.length);
    } else if (event.key === 'ArrowUp' && ingredientMatches.length > 0) {
      event.preventDefault();
      setIngredientListOpen(true);
      setActiveIngredientIndex(
        (current) => (current - 1 + ingredientMatches.length) % ingredientMatches.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (ingredientMatches[activeIngredientIndex]) {
        chooseIngredient(ingredientMatches[activeIngredientIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (draft?.ingredientQuery) {
        updateDraft({ ingredientId: '', ingredientQuery: '' });
        setIngredientListOpen(false);
        setActiveIngredientIndex(0);
      } else {
        closeEditor();
      }
    }
  }

  function removeDensity(density: IngredientDensityEntry) {
    const formData = new FormData();
    formData.set('action', 'remove');
    formData.set('revision', String(revision));
    formData.set('ingredient_id', density.ingredient_id);
    startTransition(async () => {
      const result = await manageIngredientDensity({}, formData);
      setStatus(result.message ?? '');
      if (result.status === 'saved') {
        setDensities((current) =>
          current.filter((item) => item.ingredient_id !== density.ingredient_id),
        );
        setRevision(result.revision ?? revision + 1);
        setConfirmRemoveId(null);
        router.refresh();
      } else if (result.status === 'conflict') {
        router.refresh();
      } else {
        setError(result.message ?? 'Trusted density could not be removed.');
      }
    });
  }

  function renderMeasurementControl(currentDraft: DensityDraft, dimension: 'volume' | 'weight') {
    const isVolume = dimension === 'volume';
    const label = isVolume ? 'Volume' : 'Weight';
    const quantity = isVolume ? currentDraft.volumeAmount : currentDraft.weightAmount;
    const unitCode = isVolume ? currentDraft.volumeUnitCode : currentDraft.weightUnitCode;
    const unitOptions = isVolume ? volumeOptions : weightOptions;
    const units = isVolume ? volumeUnits : weightUnits;
    return (
      <div className={styles.measurementGroup}>
        <span className={styles.measurementLabel}>{label}</span>
        <div className={styles.measureControl}>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error) || undefined}
            aria-label={`${label} amount`}
            autoComplete="off"
            enterKeyHint={isVolume ? 'next' : 'done'}
            inputMode="decimal"
            ref={isVolume ? volumeAmountRef : weightAmountRef}
            type="text"
            value={quantity}
            onChange={(event) =>
              updateDraft(
                isVolume
                  ? { volumeAmount: event.currentTarget.value }
                  : { weightAmount: event.currentTarget.value },
              )
            }
            onKeyDown={(event) => handleAmountKeyDown(event, dimension)}
          />
          <Picklist
            className={styles.unitPicker}
            label={`${label} unit`}
            options={unitOptions}
            scope={picklistScope}
            sizeToContent={false}
            value={unitCode}
            onSelect={(value) =>
              updateDraft(isVolume ? { volumeUnitCode: value } : { weightUnitCode: value })
            }
          >
            {units.find((unit) => unit.code === unitCode)?.abbreviation ?? unitCode}
          </Picklist>
        </div>
      </div>
    );
  }

  function renderEditorActions() {
    return (
      <div className={styles.editorActions}>
        <button
          aria-label={editingId ? 'Cancel density edit' : 'Cancel density entry'}
          className={`${styles.editorAction} ${styles.cancelAction}`}
          title={editingId ? 'Cancel density edit' : 'Cancel density entry'}
          type="button"
          onClick={() => closeEditor()}
        >
          <X aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Save trusted density"
          className={`${styles.editorAction} ${styles.saveAction}`}
          disabled={isPending}
          title="Save trusted density"
          type="button"
          onClick={() => saveDraft()}
        >
          <Check aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Trusted densities"
      className="settings-section settings-density-section settings-accordion-section"
    >
      <h2 className={styles.heading}>
        <button
          aria-controls="trusted-density-editor"
          aria-expanded={isExpanded}
          className={styles.toggle}
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <ChevronRight aria-hidden="true" className={styles.chevron} size={18} />
          <span>Trusted densities</span>
        </button>
      </h2>
      <div hidden={!isExpanded} id="trusted-density-editor">
        <div className={styles.manager}>
          <div className={styles.toolbar}>
            <div className={styles.searchControls}>
              <label className={styles.searchField}>
                <span>Search</span>
                <input
                  aria-label="Search trusted densities"
                  autoComplete="off"
                  ref={searchInputRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      if (search) {
                        setSearch('');
                      } else if (draft) {
                        closeEditor();
                      } else {
                        setConfirmRemoveId(null);
                      }
                    }
                  }}
                />
              </label>
              <button
                aria-label="Clear trusted density search"
                className={styles.clearButton}
                disabled={!search}
                title="Clear trusted density search"
                type="button"
                onClick={() => setSearch('')}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </div>

          {densities.length === 0 ? (
            !draft && <p className={styles.emptyState}>No trusted densities configured.</p>
          ) : (
            <div className={styles.tableViewport}>
              <table
                aria-label="Configured densities"
                className={`${styles.table} ${editingId ? styles.tableEditing : ''}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Ingredient</th>
                    <th scope="col">Volume / Weight - Density</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDensities.map((density) => {
                    const isEditing = editingId === density.ingredient_id && draft !== null;
                    return (
                      <Fragment key={density.ingredient_id}>
                        <tr
                          className={isEditing ? styles.editingRow : undefined}
                          ref={
                            isEditing
                              ? (element) => {
                                  editorRowRef.current = element;
                                }
                              : undefined
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              event.stopPropagation();
                              closeEditor();
                            }
                          }}
                        >
                          <th scope="row">
                            <button
                              aria-label={`Edit density for ${density.ingredient_name}`}
                              className={styles.ingredientButton}
                              disabled={isPending || Boolean(draft)}
                              type="button"
                              onClick={(event) => beginEdit(density, event.currentTarget)}
                            >
                              {density.ingredient_name}
                            </button>
                          </th>
                          {isEditing && draft ? (
                            <td className={styles.equationCell} colSpan={2}>
                              <div className={styles.editorEquation}>
                                {renderMeasurementControl(draft, 'volume')}
                                <span className={styles.equationSeparator}>/</span>
                                {renderMeasurementControl(draft, 'weight')}
                                <span className={styles.equationSeparator}>-</span>
                                <div className={styles.editorResult}>
                                  <span className={styles.densityValue}>
                                    {densityPreview(draft)}
                                  </span>
                                  {renderEditorActions()}
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className={styles.equationCell}>
                                <span className={styles.measurementValue}>
                                  {`${formatMeasurement(density.volume_amount, density.volume_unit_code, 'volume')} / ${formatMeasurement(density.weight_amount, density.weight_unit_code, 'weight')} - ${formatDensity(density)}`}
                                </span>
                                <button
                                  aria-label={`Edit density for ${density.ingredient_name} using ${formatDensity(density)}`}
                                  className={styles.mobileDensity}
                                  disabled={isPending || Boolean(draft)}
                                  type="button"
                                  onClick={(event) => beginEdit(density, event.currentTarget)}
                                >
                                  {formatDensity(density)}
                                </button>
                              </td>
                              <td className={styles.actionCell}>
                                <button
                                  aria-label={`Remove density for ${density.ingredient_name}`}
                                  className={styles.iconButton}
                                  disabled={isPending || Boolean(draft)}
                                  title={`Remove density for ${density.ingredient_name}`}
                                  type="button"
                                  onClick={() => {
                                    setError('');
                                    setConfirmRemoveId(density.ingredient_id);
                                  }}
                                >
                                  <Trash2 aria-hidden="true" size={17} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                        {confirmRemoveId === density.ingredient_id && (
                          <tr>
                            <td colSpan={3}>
                              <section
                                aria-label={`Remove density for ${density.ingredient_name}`}
                                className={styles.confirmation}
                              >
                                <p>
                                  Remove the trusted density for {density.ingredient_name}? Existing
                                  recipe amounts will remain unchanged.
                                </p>
                                {error && (
                                  <p className={styles.error} role="alert">
                                    {error}
                                  </p>
                                )}
                                <div className={styles.confirmActions}>
                                  <button
                                    className={styles.removeButton}
                                    disabled={isPending}
                                    type="button"
                                    onClick={() => removeDensity(density)}
                                  >
                                    Remove density
                                  </button>
                                  <button
                                    className={styles.cancelButton}
                                    type="button"
                                    onClick={() => setConfirmRemoveId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </section>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {filteredDensities.length === 0 && !draft && (
                    <tr>
                      <td className={styles.emptyCell} colSpan={3}>
                        No trusted densities found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {draft && !editingId ? (
            <fieldset
              className={`${styles.addEditorRow} ${
                densities.length === 0 ? styles.addEditorRowEmpty : ''
              }`}
              ref={(element) => {
                editorRowRef.current = element;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeEditor();
                }
              }}
            >
              <legend className="sr-only">Add trusted density</legend>
              <div className={styles.ingredientChooser}>
                <span className={styles.measurementLabel}>Ingredient</span>
                {draft.ingredientId ? (
                  <span className={styles.editorIngredientName}>{draft.ingredientQuery}</span>
                ) : (
                  <>
                    <input
                      aria-activedescendant={
                        ingredientListOpen && ingredientMatches.length
                          ? `${errorId}-ingredient-${activeIngredientIndex}`
                          : undefined
                      }
                      aria-autocomplete="list"
                      aria-controls={`${errorId}-ingredient-list`}
                      aria-expanded={ingredientListOpen && ingredientMatches.length > 0}
                      aria-label="Ingredient"
                      autoComplete="off"
                      disabled={isPending}
                      placeholder="Find an ingredient"
                      ref={ingredientSearchRef}
                      role="combobox"
                      type="text"
                      value={draft.ingredientQuery}
                      onChange={(event) => {
                        const query = event.currentTarget.value;
                        updateDraft({
                          ingredientId: '',
                          ingredientQuery: query,
                        });
                        setIngredientListOpen(Boolean(query.trim()));
                        setActiveIngredientIndex(0);
                        if (
                          query.trim() &&
                          !availableIngredients.some((ingredient) =>
                            ingredient.name
                              .toLocaleLowerCase()
                              .includes(query.trim().toLocaleLowerCase()),
                          )
                        ) {
                          setError('Choose an existing ingredient.');
                        }
                      }}
                      onKeyDown={handleIngredientKeyDown}
                    />
                    {ingredientListOpen && ingredientMatches.length > 0 && (
                      <div
                        className={styles.ingredientOptions}
                        id={`${errorId}-ingredient-list`}
                        role="listbox"
                      >
                        {ingredientMatches.map((ingredient, index) => (
                          <button
                            aria-selected={index === activeIngredientIndex}
                            className={styles.ingredientOption}
                            id={`${errorId}-ingredient-${index}`}
                            key={ingredient.id}
                            role="option"
                            type="button"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => chooseIngredient(ingredient)}
                          >
                            {ingredient.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={`${styles.editorEquation} ${styles.addEditorEquation}`}>
                {renderMeasurementControl(draft, 'volume')}
                <span className={styles.equationSeparator}>/</span>
                {renderMeasurementControl(draft, 'weight')}
                <span className={styles.equationSeparator}>-</span>
                <div className={styles.editorResult}>
                  <span className={styles.densityValue}>{densityPreview(draft)}</span>
                  {renderEditorActions()}
                </div>
              </div>
            </fieldset>
          ) : !draft ? (
            <button
              className={styles.bottomAddButton}
              disabled={isPending || availableIngredients.length === 0}
              type="button"
              onClick={(event) =>
                beginAdd(event.currentTarget, suggestedIngredient?.id, suggestedIngredient?.name)
              }
            >
              {suggestedIngredient ? `add density for ${suggestedIngredient.name}` : 'add density'}
            </button>
          ) : null}
          {availableIngredients.length === 0 && densities.length > 0 && (
            <p className={styles.emptyState}>Every ingredient already has a trusted density.</p>
          )}
          {(isPending || error || status) && (
            <p
              aria-live="polite"
              className={error ? `${styles.status} ${styles.errorStatus}` : styles.status}
              id={errorId}
              role="status"
            >
              {isPending ? 'Saving...' : error || status}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
