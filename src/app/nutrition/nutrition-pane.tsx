'use client';

import { Calculator, Plus, Salad, X } from 'lucide-react';
import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { volumeUnits, weightUnits } from '../../lib/recipes/measurement-rules';
import {
  getNutritionValuesForBasis,
  isNutritionFieldOverrideStale,
  NUTRIENT_DEFINITIONS,
  NUTRITION_FACTS_MACRO_ROWS,
  type NutrientKey,
  type NutrientValues,
  type NutritionBasis,
  type NutritionDensity,
  type NutritionFactsRow,
  type NutritionFieldOverride,
  type NutritionIngredientContribution,
  type NutritionProfile,
} from '../../lib/recipes/nutrition-rules';
import { Picklist, type PicklistOption } from '../picklist';
import styles from './nutrition-pane.module.css';

const UNIT_OPTIONS: PicklistOption[] = [
  ...volumeUnits.map((unit) => ({ value: unit.code, label: unit.abbreviation, group: 'Volume' })),
  ...weightUnits.map((unit) => ({ value: unit.code, label: unit.abbreviation, group: 'Weight' })),
];

function unitAbbreviation(unitCode: string): string {
  return UNIT_OPTIONS.find((option) => option.value === unitCode)?.label ?? unitCode;
}

const calculationNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 6,
});

function formatCalculationAmount(value: number, unit: string): string {
  const amount = calculationNumberFormatter.format(value);
  return unit ? `${amount} ${unit}` : amount;
}

function getNutritionPaneViewportBounds() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export type NutritionPaneMode = 'settings' | 'ingredient' | 'recipe';

export type NutritionPaneSave = {
  basis: NutritionBasis | null;
  basisOverride: boolean;
  values: NutrientValues;
  manualKeys: NutrientKey[];
  editedKeys: NutrientKey[];
  staleResolution: 'keep' | 'accept' | null;
};

export function NutritionPane({
  mode,
  title,
  profile = null,
  density = null,
  basisOverride = null,
  manualValues = {},
  fieldOverrides = {},
  calculatedValues = {},
  contributions = [],
  onSave,
  onClear,
  onCancel,
}: {
  mode: NutritionPaneMode;
  title: string;
  profile?: NutritionProfile | null;
  density?: NutritionDensity | null;
  basisOverride?: NutritionBasis | null;
  manualValues?: NutrientValues;
  fieldOverrides?: Partial<Record<NutrientKey, NutritionFieldOverride>>;
  calculatedValues?: NutrientValues;
  contributions?: NutritionIngredientContribution[];
  onSave: (value: NutritionPaneSave) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const fieldIdPrefix = `nutrition-${useId().replace(/:/g, '')}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const calculationTriggerRef = useRef<HTMLButtonElement>(null);
  const calculationTooltipRef = useRef<HTMLDivElement>(null);
  const staleChoiceRef = useRef<HTMLButtonElement>(null);
  const staleDialogRef = useRef<HTMLDialogElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [basis, setBasis] = useState<NutritionBasis | null>(
    () => basisOverride ?? profile?.servingSize ?? null,
  );
  const [hasBasisOverride, setHasBasisOverride] = useState(
    () => mode === 'settings' || (mode === 'ingredient' && (basisOverride !== null || !profile)),
  );
  const [values, setValues] = useState<NutrientValues>(() =>
    mode === 'settings' ? (profile?.nutrients ?? {}) : { ...manualValues },
  );
  const [manualKeys, setManualKeys] = useState<Set<NutrientKey>>(() => {
    if (mode === 'settings') {
      return new Set(Object.keys(profile?.nutrients ?? {}) as NutrientKey[]);
    }
    return new Set(Object.keys(manualValues) as NutrientKey[]);
  });
  const [editedKeys, setEditedKeys] = useState<Set<NutrientKey>>(new Set());
  const [activeOptionalKeys, setActiveOptionalKeys] = useState<Set<NutrientKey>>(
    () =>
      new Set(
        NUTRIENT_DEFINITIONS.filter(
          (field) =>
            field.optional &&
            (profile?.nutrients[field.key] !== undefined ||
              manualValues[field.key] !== undefined ||
              calculatedValues[field.key] !== undefined),
        ).map((field) => field.key),
      ),
  );
  const [error, setError] = useState('');
  const [confirmStaleOverrides, setConfirmStaleOverrides] = useState(false);
  const [staleKeys, setStaleKeys] = useState<NutrientKey[]>([]);
  const [activeCalculationKey, setActiveCalculationKey] = useState<NutrientKey | null>(null);
  const [calculationTooltipPosition, setCalculationTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const autoValues = useMemo(
    () =>
      mode === 'ingredient' && profile && basis
        ? getNutritionValuesForBasis(profile, basis, density)
        : mode === 'recipe'
          ? calculatedValues
          : {},
    [basis, calculatedValues, density, mode, profile],
  );
  const optionalOptions = NUTRIENT_DEFINITIONS.filter(
    (field) => field.optional && !activeOptionalKeys.has(field.key),
  );

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!portalRoot || !dialog) return;
    dialog.showModal();
    firstInputRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [portalRoot]);

  useEffect(() => {
    const dialog = staleDialogRef.current;
    if (!confirmStaleOverrides || !dialog) return;
    dialog.showModal();
    staleChoiceRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [confirmStaleOverrides]);

  useLayoutEffect(() => {
    if (!activeCalculationKey) {
      setCalculationTooltipPosition(null);
      return;
    }

    function positionTooltip() {
      const trigger = calculationTriggerRef.current?.getBoundingClientRect();
      const tooltip = calculationTooltipRef.current;
      if (!trigger || !tooltip) return;

      const viewport = getNutritionPaneViewportBounds();
      const bounds = tooltip.getBoundingClientRect();
      const width = Math.min(bounds.width, viewport.width - 24);
      const height = Math.min(bounds.height, viewport.height - 24);
      const left = Math.max(
        viewport.left + 12,
        Math.min(
          trigger.left + trigger.width / 2 - width / 2,
          viewport.left + viewport.width - width - 12,
        ),
      );
      const aboveSpace = trigger.top - viewport.top - 12;
      const top =
        aboveSpace >= height + 8
          ? trigger.top - height - 8
          : Math.min(trigger.bottom + 8, viewport.top + viewport.height - height - 12);
      setCalculationTooltipPosition({ left, top });
    }

    const visualViewport = window.visualViewport;
    const tooltip = calculationTooltipRef.current;
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);
    visualViewport?.addEventListener('resize', positionTooltip);
    visualViewport?.addEventListener('scroll', positionTooltip);
    const resizeObserver = tooltip ? new ResizeObserver(positionTooltip) : null;
    if (tooltip) resizeObserver?.observe(tooltip);
    return () => {
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
      visualViewport?.removeEventListener('resize', positionTooltip);
      visualViewport?.removeEventListener('scroll', positionTooltip);
      resizeObserver?.disconnect();
    };
  }, [activeCalculationKey]);

  function updateBasis(update: Partial<NutritionBasis>) {
    setConfirmStaleOverrides(false);
    setStaleKeys([]);
    setHasBasisOverride(true);
    setBasis((current) => {
      const dimension = update.dimension ?? current?.dimension ?? 'volume';
      const unitCode =
        update.unitCode ?? current?.unitCode ?? (dimension === 'weight' ? 'g' : 'cup');
      return {
        amount: update.amount ?? current?.amount ?? 1,
        dimension,
        unitCode,
      };
    });
  }

  function visibleValue(key: NutrientKey): string {
    const value = values[key] ?? autoValues[key];
    return value === undefined ? '' : String(value);
  }

  function updateValue(key: NutrientKey, raw: string) {
    setConfirmStaleOverrides(false);
    setStaleKeys([]);
    setEditedKeys((current) => new Set(current).add(key));
    if (!raw.trim()) {
      setManualKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setValues((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a finite, nonnegative amount or leave the field blank.');
      return;
    }
    setError('');
    setManualKeys((current) => new Set(current).add(key));
    setValues((current) => ({ ...current, [key]: amount }));
    setActiveOptionalKeys((current) => new Set(current).add(key));
  }

  function commitSave(staleResolution: NutritionPaneSave['staleResolution']) {
    const nextValues: NutrientValues = {};
    for (const field of NUTRIENT_DEFINITIONS) {
      const value = manualKeys.has(field.key) ? values[field.key] : autoValues[field.key];
      if (value !== undefined) nextValues[field.key] = value;
    }
    if (mode === 'settings' && nextValues.calories === undefined) {
      setError('Enter Calories.');
      return;
    }
    onSave({
      basis,
      basisOverride: hasBasisOverride,
      values: nextValues,
      manualKeys: [...manualKeys],
      editedKeys: [...editedKeys],
      staleResolution,
    });
  }

  function save() {
    if (mode !== 'recipe') {
      if (!basis || !Number.isFinite(basis.amount) || basis.amount <= 0) {
        setError('Enter a positive serving size and supported unit.');
        return;
      }
      if (visibleValue('calories') === '') {
        setError('Enter Calories.');
        return;
      }
    }
    const unchangedStaleKeys = NUTRIENT_DEFINITIONS.flatMap((field) => {
      const override = fieldOverrides[field.key];
      return mode === 'ingredient' &&
        manualKeys.has(field.key) &&
        override !== undefined &&
        !editedKeys.has(field.key) &&
        basis !== null &&
        isNutritionFieldOverrideStale(override, basis)
        ? [field.key]
        : [];
    });
    if (unchangedStaleKeys.length > 0) {
      setStaleKeys(unchangedStaleKeys);
      setConfirmStaleOverrides(true);
      return;
    }
    commitSave(null);
  }

  function addOptionalNutrient(key: NutrientKey) {
    setActiveOptionalKeys((current) => new Set(current).add(key));
    requestAnimationFrame(() => document.getElementById(`${fieldIdPrefix}-${key}`)?.focus());
  }

  function removeOptionalNutrient(key: NutrientKey) {
    setConfirmStaleOverrides(false);
    setStaleKeys([]);
    setActiveOptionalKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setManualKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setEditedKeys((current) => new Set(current).add(key));
    setValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const effectiveBasis = basisOverride ?? profile?.servingSize ?? null;
  const vitaminRows: NutrientKey[] = NUTRIENT_DEFINITIONS.filter(
    (field) =>
      ['vitamin_d', 'calcium', 'iron', 'potassium'].includes(field.key) ||
      (field.optional && activeOptionalKeys.has(field.key)),
  ).map((field) => field.key);
  const visibleNutrientKeys: NutrientKey[] = [
    'calories',
    ...NUTRITION_FACTS_MACRO_ROWS.map((row) => row.key),
    ...vitaminRows,
  ];
  const emptyNutrientKeys = visibleNutrientKeys.filter((key) => visibleValue(key) === '');

  function zeroEmptyFields() {
    if (emptyNutrientKeys.length === 0) return;
    setConfirmStaleOverrides(false);
    setStaleKeys([]);
    setError('');
    setEditedKeys((current) => new Set([...current, ...emptyNutrientKeys]));
    setManualKeys((current) => new Set([...current, ...emptyNutrientKeys]));
    setValues((current) => {
      const next = { ...current };
      for (const key of emptyNutrientKeys) next[key] = 0;
      return next;
    });
  }

  const hasAutoValues = mode !== 'settings' && Object.keys(autoValues).length > 0;
  const autoDescription =
    mode === 'ingredient' ? 'from ingredient Settings' : 'calculated from ingredients';

  function renderNutrientRow(row: NutritionFactsRow, index: number) {
    const field = NUTRIENT_DEFINITIONS.find((definition) => definition.key === row.key);
    if (!field) return null;
    const isAuto =
      mode !== 'settings' && !manualKeys.has(field.key) && autoValues[field.key] !== undefined;
    const fieldOverride = fieldOverrides[field.key];
    const contributionRows = contributions.filter(
      (contribution) =>
        contribution.multiplier !== null &&
        contribution.listedValues[field.key] !== undefined &&
        contribution.values?.[field.key] !== undefined,
    );
    const canShowCalculation = mode === 'recipe' && isAuto && contributionRows.length > 0;
    const calculationTooltipId = `${fieldIdPrefix}-calculation-${field.key}`;
    const isStale =
      mode === 'ingredient' &&
      fieldOverride !== undefined &&
      basis !== null &&
      isNutritionFieldOverrideStale(fieldOverride, basis);
    const isRemovable = field.optional && autoValues[field.key] === undefined;
    const inputId = `${fieldIdPrefix}-${field.key}`;
    const rowClassName = [
      styles.factRow,
      row.level === 1 ? styles.indent1 : '',
      row.level === 2 ? styles.indent2 : '',
      row.bold ? styles.boldRow : '',
      field.key === 'calories' ? styles.caloriesRow : '',
      isAuto ? styles.autoField : '',
      isStale ? styles.staleField : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={rowClassName} key={field.key}>
        <span className={styles.factLabel}>
          <label htmlFor={inputId}>{field.label}</label>
          {field.key === 'calories' && mode !== 'recipe' && (
            <span className={styles.required}>required</span>
          )}
          {isStale && <span className={styles.staleTag}>serving changed</span>}
          {isRemovable && (
            <button
              aria-label={`Remove ${field.label}`}
              className={styles.removeButton}
              title={`Remove ${field.label}`}
              type="button"
              onClick={() => removeOptionalNutrient(field.key)}
            >
              <X aria-hidden="true" size={14} />
            </button>
          )}
        </span>
        <div className={styles.factValue}>
          {isAuto && !canShowCalculation && (
            <span aria-hidden="true" className={styles.autoIndicator} title={autoDescription}>
              <Calculator aria-hidden="true" size={13} strokeWidth={2} />
            </span>
          )}
          {canShowCalculation && (
            <fieldset
              aria-label={`${field.label} calculation help`}
              className={`${styles.autoIndicator} ${styles.calculationIndicator}`}
              onBlurCapture={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                ) {
                  setActiveCalculationKey(null);
                }
              }}
              onFocusCapture={(event) => {
                const trigger = event.target;
                if (trigger instanceof HTMLButtonElement) calculationTriggerRef.current = trigger;
                setActiveCalculationKey(field.key);
              }}
              onMouseEnter={(event) => {
                const trigger = event.currentTarget.querySelector('button');
                if (trigger) calculationTriggerRef.current = trigger;
                setActiveCalculationKey(field.key);
              }}
              onMouseLeave={() => setActiveCalculationKey(null)}
            >
              <button
                aria-describedby={
                  activeCalculationKey === field.key ? calculationTooltipId : undefined
                }
                aria-label={`Show ${field.label} ingredient calculation`}
                className={styles.calculationTrigger}
                ref={(trigger) => {
                  if (activeCalculationKey === field.key) calculationTriggerRef.current = trigger;
                }}
                type="button"
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveCalculationKey(null);
                }}
              >
                <Calculator aria-hidden="true" size={13} strokeWidth={2} />
              </button>
              {activeCalculationKey === field.key && (
                <div
                  aria-label={`${field.label} ingredient calculation`}
                  className={styles.calculationTooltip}
                  id={calculationTooltipId}
                  ref={calculationTooltipRef}
                  role="tooltip"
                  style={{
                    left: calculationTooltipPosition?.left ?? 0,
                    top: calculationTooltipPosition?.top ?? 0,
                    visibility: calculationTooltipPosition ? 'visible' : 'hidden',
                  }}
                >
                  <p className={styles.calculationTooltipTitle}>{field.label} by ingredient</p>
                  <p className={styles.calculationTooltipNote}>
                    Ingredient totals before dividing by servings.
                  </p>
                  <table className={styles.calculationTable}>
                    <thead>
                      <tr>
                        <th scope="col">Ingredient</th>
                        <th scope="col">Listed</th>
                        <th aria-label="Multiplier" scope="col">
                          ×
                        </th>
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionRows.map((contribution) => (
                        <tr key={contribution.ingredientId}>
                          <th scope="row">{contribution.ingredientName}</th>
                          <td>
                            {formatCalculationAmount(
                              contribution.listedValues[field.key] ?? 0,
                              field.unit,
                            )}
                          </td>
                          <td>{calculationNumberFormatter.format(contribution.multiplier ?? 0)}</td>
                          <td>
                            {formatCalculationAmount(
                              contribution.values?.[field.key] ?? 0,
                              field.unit,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </fieldset>
          )}
          <input
            aria-label={`${field.label}${isAuto ? `, ${autoDescription}` : ''}${isStale ? ', serving changed' : ''}`}
            id={inputId}
            inputMode="decimal"
            min="0"
            ref={index === 0 && mode === 'recipe' ? firstInputRef : undefined}
            required={field.key === 'calories' && mode !== 'recipe'}
            step="any"
            style={
              {
                '--nutrient-chars': Math.max(3, visibleValue(field.key).replace('.', '').length),
              } as CSSProperties
            }
            type="number"
            value={visibleValue(field.key)}
            onChange={(event) => updateValue(field.key, event.currentTarget.value)}
          />
          <span aria-hidden="true" className={styles.factUnit}>
            {field.unit}
          </span>
        </div>
      </div>
    );
  }

  if (!portalRoot) return null;

  return createPortal(
    // React events bubble through portals to the recipe editor; keep pane events local.
    <dialog
      aria-labelledby={`${fieldIdPrefix}-title`}
      className={styles.dialog}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === dialogRef.current) onCancel();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onCancel();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className={styles.heading}>
        <h2 className={styles.title} id={`${fieldIdPrefix}-title`}>
          <Salad aria-hidden="true" className={styles.titleIcon} size={22} />
          <span className="visually-hidden">Nutrition for </span>
          <span className={styles.titleText}>{title}</span>
        </h2>
        <button
          aria-label="Close nutrition"
          className={styles.closeButton}
          type="button"
          onClick={onCancel}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>
      <form
        className={styles.form}
        inert={confirmStaleOverrides}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          save();
        }}
      >
        <div className={styles.factsLabel}>
          <p aria-hidden="true" className={styles.factsTitle}>
            Nutrition Facts
          </p>
          {mode !== 'recipe' ? (
            <fieldset className={styles.servingGroup}>
              <legend className={styles.servingLegend}>
                Serving size
                <span className={styles.required}>required</span>
              </legend>
              {mode === 'ingredient' && !hasBasisOverride && effectiveBasis ? (
                <p className={styles.inheritedBasis}>
                  {effectiveBasis.amount} {unitAbbreviation(effectiveBasis.unitCode)}{' '}
                  <span>from ingredient Settings</span>
                </p>
              ) : (
                <div className={styles.servingFields}>
                  <input
                    aria-label="Serving size amount"
                    ref={firstInputRef}
                    inputMode="decimal"
                    min="0"
                    required
                    step="any"
                    type="number"
                    value={basis?.amount ?? ''}
                    onChange={(event) => {
                      const amount = event.currentTarget.valueAsNumber;
                      updateBasis({ amount: Number.isFinite(amount) ? amount : 0 });
                    }}
                  />
                  <Picklist
                    className={styles.unitPicklist}
                    label="Serving size unit"
                    options={UNIT_OPTIONS}
                    value={basis?.unitCode ?? 'cup'}
                    onSelect={(unitCode) =>
                      updateBasis({
                        unitCode,
                        dimension: weightUnits.some((unit) => unit.code === unitCode)
                          ? 'weight'
                          : 'volume',
                      })
                    }
                  />
                </div>
              )}
              {mode === 'ingredient' && profile && (
                <label className={styles.basisToggle}>
                  <input
                    checked={hasBasisOverride}
                    type="checkbox"
                    onChange={(event) => {
                      setHasBasisOverride(event.target.checked);
                      if (!event.target.checked) setBasis(profile.servingSize);
                    }}
                  />
                  Use a recipe-specific serving size
                </label>
              )}
              {mode === 'ingredient' && !profile && (
                <p className={styles.note}>
                  This serving size and its values are saved with this recipe only.
                </p>
              )}
            </fieldset>
          ) : (
            <p className={styles.servingNote}>Amounts per serving</p>
          )}
          <div aria-hidden="true" className={styles.thickRule} />
          {renderNutrientRow({ key: 'calories', level: 0, bold: true }, 0)}
          <div aria-hidden="true" className={styles.mediumRule} />
          {NUTRITION_FACTS_MACRO_ROWS.map((row, index) => renderNutrientRow(row, index + 1))}
          <div aria-hidden="true" className={styles.thickRule} />
          {vitaminRows.map((key, index) =>
            renderNutrientRow(
              { key, level: 0, bold: false },
              NUTRITION_FACTS_MACRO_ROWS.length + index + 1,
            ),
          )}
          {optionalOptions.length > 0 && (
            <div className={styles.addRow}>
              <Picklist
                className={styles.addPicklist}
                label="Add vitamin/mineral"
                options={optionalOptions.map((field) => ({ value: field.key, label: field.label }))}
                showSelectionCheckmark={false}
                sizeToContent={false}
                value=""
                onSelect={(key) => addOptionalNutrient(key as NutrientKey)}
              >
                <Plus aria-hidden="true" size={15} />
                <span>Add vitamin/mineral</span>
              </Picklist>
            </div>
          )}
        </div>
        {hasAutoValues && (
          <p className={styles.note}>
            <span aria-hidden="true" className={styles.autoSwatch} /> Shaded values are filled in{' '}
            {mode === 'ingredient' ? 'from ingredient Settings' : 'from the ingredients'}. Type your
            own value to replace one; clear it to restore the automatic value.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button className={styles.clearButton} type="button" onClick={onClear}>
            Clear
          </button>
          <button
            className={styles.clearButton}
            disabled={emptyNutrientKeys.length === 0}
            type="button"
            onClick={zeroEmptyFields}
          >
            Zero Empty Fields
          </button>
          <span className={styles.actionSpacer} />
          <button className={styles.cancelButton} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.saveButton} type="submit">
            Save
          </button>
        </div>
      </form>
      {confirmStaleOverrides && (
        <dialog
          aria-describedby={`${fieldIdPrefix}-stale-description`}
          aria-labelledby={`${fieldIdPrefix}-stale-title`}
          className={`recipe-confirmation-dialog ${styles.staleConfirmation}`}
          ref={staleDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setConfirmStaleOverrides(false);
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === staleDialogRef.current) setConfirmStaleOverrides(false);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              setConfirmStaleOverrides(false);
            }
          }}
        >
          <h2 id={`${fieldIdPrefix}-stale-title`}>Serving changed</h2>
          <p id={`${fieldIdPrefix}-stale-description`}>
            {staleKeys
              .map((key) => NUTRIENT_DEFINITIONS.find((field) => field.key === key)?.label)
              .filter((label) => label !== undefined)
              .join(', ')}{' '}
            were entered for a different serving size. Keep them marked stale, or update them to the
            current serving without changing their amounts.
          </p>
          <div className={`recipe-confirmation-actions ${styles.staleActions}`}>
            <button
              className="recipe-secondary-button"
              type="button"
              onClick={() => setConfirmStaleOverrides(false)}
            >
              Cancel
            </button>
            <button
              className="recipe-primary-button"
              ref={staleChoiceRef}
              type="button"
              onClick={() => commitSave('keep')}
            >
              Keep stale
            </button>
            <button
              className="recipe-primary-button"
              type="button"
              onClick={() => commitSave('accept')}
            >
              Update as-is
            </button>
          </div>
        </dialog>
      )}
    </dialog>,
    portalRoot,
  );
}

export function nutritionFieldOverridesToValues(
  overrides: Partial<Record<NutrientKey, NutritionFieldOverride>>,
): NutrientValues {
  return Object.fromEntries(
    Object.entries(overrides).flatMap(([key, override]) =>
      override ? [[key, override.value]] : [],
    ),
  ) as NutrientValues;
}

export function nutritionValuesToProfile(
  basis: NutritionBasis,
  values: NutrientValues,
): NutritionProfile {
  return { servingSize: basis, nutrients: values };
}
