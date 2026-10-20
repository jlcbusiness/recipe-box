'use client';

import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  Hash,
  Laptop,
  List,
  ListChecks,
  ListOrdered,
  LockKeyhole,
  type LucideIcon,
  Scale,
  Table2,
  X,
} from 'lucide-react';
import {
  createContext,
  type Dispatch,
  Fragment,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { RecipeIngredient, RecipeInstructionStep } from '../../lib/recipes/data';
import {
  getIngredientDisplayParts,
  type IngredientDisplayInput,
} from '../../lib/recipes/ingredient-rules';
import {
  formatQuantity,
  type MeasurementSystem,
  type MeasurementType,
  type MeasurementUnit,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';
import {
  getScaleMultiplier,
  type IngredientPresentation,
  type IngredientSortDirection,
  type IngredientSortMode,
  type IngredientUnitOverrides,
  type MeasurementDimension,
  type RecipeScale,
  sortRecipeIngredients,
  transformIngredientForDisplay,
} from '../../lib/recipes/recipe-reader-rules';
import {
  Picklist as ReaderPicklist,
  type PicklistOption as ReaderPicklistOption,
} from '../picklist';

type ScaleMode = 'servings' | 'multiply' | 'divide';

type ScreenWakeLockSentinel = {
  addEventListener: (type: 'release', listener: () => void) => void;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<ScreenWakeLockSentinel> };
};

function getReaderViewportBounds() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function renderFractionGlyphs(value: string): ReactNode {
  const parts: ReactNode[] = [];
  let previousIndex = 0;
  for (const match of value.matchAll(/½|⅓|⅔|¼|¾|⅛|⅜|⅝|⅞/gu)) {
    const index = match.index ?? 0;
    if (index > previousIndex) {
      parts.push(value.slice(previousIndex, index));
    }
    parts.push(
      <span className="recipe-fraction-glyph" data-fraction={match[0]} key={`fraction-${index}`}>
        {match[0]}
      </span>,
    );
    previousIndex = index + match[0].length;
  }
  parts.push(value.slice(previousIndex));
  return parts;
}

type RecipeScaleContextValue = {
  scale: RecipeScale;
  multiplier: number;
  setScale: (scale: RecipeScale) => void;
  unitOverrides: Record<string, IngredientUnitOverrides>;
  setUnitOverrides: Dispatch<SetStateAction<Record<string, IngredientUnitOverrides>>>;
};

const RecipeScaleContext = createContext<RecipeScaleContextValue | null>(null);

function useRecipeScale(): RecipeScaleContextValue {
  const context = useContext(RecipeScaleContext);
  if (!context) {
    throw new Error('Recipe reader controls must be inside RecipeReaderProvider.');
  }
  return context;
}

export function RecipeInstructionMention({
  displayName,
  ingredient,
  preserveStoredUnits = false,
  unitSystems,
}: {
  displayName: string;
  ingredient: RecipeIngredient;
  preserveStoredUnits?: boolean;
  unitSystems: { volume: MeasurementSystem; weight: MeasurementSystem };
}) {
  const { multiplier, unitOverrides } = useRecipeScale();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const popupId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [escapeDismissed, setEscapeDismissed] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: 'above' | 'below';
  } | null>(null);
  const displayIngredient = transformIngredientForDisplay(ingredient, {
    multiplier,
    unitSystems,
    preserveStoredUnits,
    unitOverrides: unitOverrides[ingredient.id],
  });
  const parts = getIngredientDisplayParts(displayIngredient, { aliasPinch: true });
  const amount =
    [parts.amount, parts.unmeasuredPhrase].filter(Boolean).join(' ') || 'No amount listed';
  const isOpen = isPinned || ((isHovered || isFocused) && !escapeDismissed);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    const positionPopup = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!trigger || !popup) {
        return;
      }

      const viewport = getReaderViewportBounds();
      const bounds = popup.getBoundingClientRect();
      const width = Math.min(bounds.width, viewport.width - 24);
      const height = Math.min(bounds.height, viewport.height - 24);
      const center = trigger.left + trigger.width / 2;
      const left = Math.max(
        viewport.left + 12,
        Math.min(center - width / 2, viewport.left + viewport.width - width - 12),
      );
      const top = Math.max(viewport.top + 12, trigger.top - height - 8);
      const tailLeft = Math.max(12, Math.min(center - left, width - 12));
      popup.style.setProperty('--recipe-mention-tail-left', `${tailLeft}px`);
      setPosition({ left, top, placement: 'above' });
    };

    const visualViewport = window.visualViewport;
    const popup = popupRef.current;
    positionPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    visualViewport?.addEventListener('resize', positionPopup);
    visualViewport?.addEventListener('scroll', positionPopup);
    const resizeObserver = popup ? new ResizeObserver(positionPopup) : null;
    if (popup) {
      resizeObserver?.observe(popup);
    }
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      visualViewport?.removeEventListener('resize', positionPopup);
      visualViewport?.removeEventListener('scroll', positionPopup);
      resizeObserver?.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !popupRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setIsPinned(false);
        setIsHovered(false);
        setIsFocused(false);
        setEscapeDismissed(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen]);

  return (
    <span className="recipe-instruction-mention-wrap">
      <button
        aria-controls={isOpen ? popupId : undefined}
        aria-describedby={isOpen ? popupId : undefined}
        aria-expanded={isOpen}
        className="recipe-instruction-mention"
        ref={buttonRef}
        type="button"
        onBlur={() => setIsFocused(false)}
        onClick={() => {
          if (isPinned) {
            setIsPinned(false);
            setEscapeDismissed(true);
          } else {
            setEscapeDismissed(false);
            setIsPinned(true);
          }
        }}
        onFocus={() => {
          setEscapeDismissed(false);
          setIsFocused(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsPinned(false);
            setEscapeDismissed(true);
            buttonRef.current?.focus();
          }
        }}
        onMouseEnter={() => {
          setEscapeDismissed(false);
          setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        {displayName}
      </button>
      {isOpen && (
        <span
          className="recipe-instruction-amount-popup recipe-screen-only"
          data-placement={position?.placement ?? 'below'}
          id={popupId}
          ref={popupRef}
          role="tooltip"
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {renderFractionGlyphs(amount)}
        </span>
      )}
    </span>
  );
}

function initialScale(serves: number | null): RecipeScale {
  return serves !== null && serves > 0
    ? { mode: 'servings', baseServings: serves, targetServings: serves }
    : { mode: 'multiply', factor: 1 };
}

export function RecipeReaderProvider({
  serves,
  children,
}: {
  serves: number | null;
  children: ReactNode;
}) {
  const [scale, setScale] = useState<RecipeScale>(() => initialScale(serves));
  const [unitOverrides, setUnitOverrides] = useState<Record<string, IngredientUnitOverrides>>({});
  const value = {
    scale,
    multiplier: getScaleMultiplier(scale),
    setScale,
    unitOverrides,
    setUnitOverrides,
  };

  return <RecipeScaleContext.Provider value={value}>{children}</RecipeScaleContext.Provider>;
}

function selectedScaleDraft(scale: RecipeScale): { mode: ScaleMode; to: string } {
  if (scale.mode === 'servings') {
    return { mode: scale.mode, to: String(scale.targetServings) };
  }
  if (scale.mode === 'multiply') {
    return { mode: scale.mode, to: String(scale.factor) };
  }
  return { mode: scale.mode, to: String(scale.divisor) };
}

function ReaderScaleButton({ serves }: { serves: number | null }) {
  const { scale, multiplier, setScale, setUnitOverrides } = useRecipeScale();
  const scope = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ScaleMode>(initialScale(serves).mode);
  const [to, setTo] = useState(String(serves ?? 2));
  const [error, setError] = useState('');
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const panelId = useId();
  const scaleOptions: ReaderPicklistOption[] = [
    ...(serves === null ? [] : [{ value: 'servings', label: 'Servings' }]),
    { value: 'multiply', label: 'Multiply' },
    { value: 'divide', label: 'Divide' },
  ];

  function restoreDraft() {
    const draft = selectedScaleDraft(scale);
    setMode(draft.mode);
    setTo(serves === null && scale.mode === 'multiply' && scale.factor === 1 ? '2' : draft.to);
    setError('');
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const positionPanel = () => {
      const bounds = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!bounds || !panel) {
        return;
      }
      const viewport = getReaderViewportBounds();
      const width = Math.min(panel.getBoundingClientRect().width, viewport.width - 24);
      const maxHeight = Math.max(0, viewport.height - 24);
      const height = Math.min(panel.scrollHeight, maxHeight);
      const above =
        bounds.bottom + height + 12 > viewport.top + viewport.height &&
        bounds.top > viewport.top + height + 12;
      setPanelPosition({
        left: Math.max(
          viewport.left + 12,
          Math.min(bounds.right - width, viewport.left + viewport.width - width - 12),
        ),
        top: above
          ? Math.max(viewport.top + 12, bounds.top - height - 8)
          : Math.min(bounds.bottom + 8, viewport.top + viewport.height - height - 12),
        maxHeight,
      });
    };
    const visualViewport = window.visualViewport;
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    visualViewport?.addEventListener('resize', positionPanel);
    visualViewport?.addEventListener('scroll', positionPanel);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      visualViewport?.removeEventListener('resize', positionPanel);
      visualViewport?.removeEventListener('scroll', positionPanel);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      const targetScope =
        target instanceof Element
          ? target.closest('[data-picklist-scope]')?.getAttribute('data-picklist-scope')
          : null;
      if (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target) &&
        targetScope !== scope
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen, scope]);

  function close() {
    setIsOpen(false);
    setPanelPosition(null);
    buttonRef.current?.focus();
  }

  function changeMode(nextMode: string) {
    const next = nextMode as ScaleMode;
    setMode(next);
    setTo(next === 'servings' ? String(serves ?? 1) : '2');
    setError('');
  }

  function reset() {
    const baseScale = initialScale(serves);
    setScale(baseScale);
    setUnitOverrides({});
    const draft = selectedScaleDraft(baseScale);
    setMode(draft.mode);
    setTo(draft.mode === 'servings' ? draft.to : '2');
    setError('');
  }

  function submit() {
    const numericValue = Number(to);
    const nextScale: RecipeScale =
      mode === 'servings'
        ? { mode, baseServings: serves, targetServings: numericValue }
        : mode === 'multiply'
          ? { mode, factor: numericValue }
          : { mode, divisor: numericValue };
    try {
      getScaleMultiplier(nextScale);
      setScale(nextScale);
      close();
    } catch {
      setError(
        mode === 'servings'
          ? 'To must be a positive whole serving count.'
          : mode === 'multiply'
            ? 'By must be a positive number.'
            : 'By must be a positive whole number.',
      );
    }
  }

  return (
    <span className="recipe-scale-control">
      <button
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        aria-label="Scale recipe"
        className="recipe-scale-button recipe-reader-icon-button recipe-screen-only"
        ref={buttonRef}
        title="Scale recipe"
        type="button"
        onClick={() => {
          if (isOpen) {
            close();
          } else {
            restoreDraft();
            setIsOpen(true);
          }
        }}
      >
        <Scale aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-label="Scale recipe"
            className="recipe-scaling-pane recipe-screen-only"
            id={panelId}
            ref={panelRef}
            role="dialog"
            style={{
              left: panelPosition?.left ?? 0,
              top: panelPosition?.top ?? 0,
              maxHeight: panelPosition?.maxHeight,
              visibility: panelPosition ? 'visible' : 'hidden',
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
          >
            <div className="recipe-scaling-top-row">
              <div className="recipe-scaling-field">
                <span>Scale</span>
                <ReaderPicklist
                  autoFocus
                  className="recipe-scaling-mode"
                  label="Scale"
                  options={scaleOptions}
                  scope={scope}
                  value={mode}
                  onSelect={changeMode}
                />
              </div>
              <label className="recipe-scaling-field">
                <span>{mode === 'servings' ? 'To' : 'By'}</span>
                <input
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${panelId}-error` : undefined}
                  className="recipe-scaling-to"
                  min={mode === 'multiply' ? '0.01' : '1'}
                  step={mode === 'multiply' ? 'any' : '1'}
                  type="number"
                  value={to}
                  onChange={(event) => {
                    setTo(event.currentTarget.value);
                    setError('');
                  }}
                />
              </label>
              <button
                aria-label="Close scaling"
                className="recipe-scaling-close"
                title="Cancel scaling"
                type="button"
                onClick={close}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
            {error && (
              <p className="recipe-scaling-error" id={`${panelId}-error`} role="alert">
                {error}
              </p>
            )}
            <div className="recipe-scaling-actions">
              {multiplier !== 1 && (
                <button className="recipe-secondary-button" type="button" onClick={reset}>
                  Reset
                </button>
              )}
              <button className="recipe-primary-button" type="button" onClick={submit}>
                Submit
              </button>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}

export function RecipeServesControl({ serves }: { serves: number }) {
  const { multiplier } = useRecipeScale();
  return (
    <dd className="recipe-serves-value">
      <span>Serves {formatQuantity(serves * multiplier, 'us_customary')}</span>
    </dd>
  );
}

function ReaderUnitPicklist({
  ingredientName,
  dimension,
  unitCode,
  unitLabel,
  defaultUnitCode,
  isOverridden,
  onSelect,
}: {
  ingredientName: string;
  dimension: MeasurementDimension;
  unitCode: string;
  unitLabel: string;
  defaultUnitCode: string;
  isOverridden: boolean;
  onSelect: (unitCode: string) => void;
}) {
  const units: MeasurementUnit[] = dimension === 'volume' ? volumeUnits : weightUnits;
  const defaultUnit = units.find((unit) => unit.code === defaultUnitCode);
  const options: ReaderPicklistOption[] = [
    ...(isOverridden
      ? [
          {
            value: '__recipe_default',
            label: `Recipe default (${defaultUnit?.abbreviation ?? defaultUnitCode})`,
          },
        ]
      : []),
    ...units.map((unit) => ({
      value: unit.code,
      label: unit.abbreviation,
      group: unit.system === 'us_customary' ? 'US' : 'Metric',
    })),
  ];

  return (
    <ReaderPicklist
      className="recipe-reader-unit-trigger"
      label={`Change ${ingredientName} ${dimension} unit`}
      options={options}
      showArrow={false}
      title={`Change ${dimension} unit`}
      value={isOverridden ? unitCode : defaultUnitCode}
      onSelect={(value) => onSelect(value === '__recipe_default' ? '' : value)}
    >
      {unitLabel}
    </ReaderPicklist>
  );
}

export function RecipeReader({
  defaultPresentation,
  ingredients,
  instructions,
  preserveStoredUnits = false,
  recipeId,
  serves,
  steps,
  volumeSystem,
  weightSystem,
}: {
  defaultPresentation: IngredientPresentation;
  ingredients: RecipeIngredient[];
  instructions?: ReactNode;
  preserveStoredUnits?: boolean;
  recipeId: string;
  serves: number | null;
  steps: Array<Pick<RecipeInstructionStep, 'position' | 'content_markdown'>>;
  volumeSystem: MeasurementSystem;
  weightSystem: MeasurementSystem;
}) {
  const { multiplier, unitOverrides, setUnitOverrides } = useRecipeScale();
  const unitSystems = { volume: volumeSystem, weight: weightSystem };
  const [presentation, setPresentation] = useState(defaultPresentation);
  const [sortMode, setSortMode] = useState<IngredientSortMode>('entered');
  const [sortDirection, setSortDirection] = useState<IngredientSortDirection>('ascending');
  const [cookMode, setCookMode] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [wakeStatus, setWakeStatus] = useState('');
  const previousRecipeIdRef = useRef(recipeId);

  useEffect(() => {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 760px)').matches
    ) {
      setPresentation('ingredient_first');
    }
  }, []);

  useEffect(() => {
    if (previousRecipeIdRef.current !== recipeId) {
      previousRecipeIdRef.current = recipeId;
      setCookMode(false);
      setCheckedIngredients({});
      setWakeStatus('');
    }
  }, [recipeId]);

  useEffect(() => {
    if (!cookMode) {
      return;
    }

    let disposed = false;
    let requestPending = false;
    let sentinel: ScreenWakeLockSentinel | null = null;
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;

    async function requestWakeLock() {
      if (!wakeLock) {
        setWakeStatus('unavailable');
        return;
      }
      if (sentinel || requestPending) {
        return;
      }

      requestPending = true;
      setWakeStatus('requesting');
      try {
        const acquired = await wakeLock.request('screen');
        requestPending = false;
        if (disposed) {
          void acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) {
            sentinel = null;
          }
          if (!disposed) {
            setWakeStatus('released');
          }
        });
        setWakeStatus('active');
      } catch {
        requestPending = false;
        if (!disposed) {
          setWakeStatus('failed');
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !sentinel) {
        void requestWakeLock();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void requestWakeLock();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel) {
        const activeSentinel = sentinel;
        sentinel = null;
        void activeSentinel.release().catch(() => {});
      }
    };
  }, [cookMode]);

  function setIngredientOverride(
    ingredientId: string,
    dimension: 'volume' | 'weight',
    unitCode: string,
  ) {
    setUnitOverrides((current) => {
      const ingredientOverrides = { ...current[ingredientId] };
      if (unitCode) {
        ingredientOverrides[dimension] = unitCode;
      } else {
        delete ingredientOverrides[dimension];
      }
      return { ...current, [ingredientId]: ingredientOverrides };
    });
  }

  const sortedIngredients = sortRecipeIngredients(ingredients, steps, sortMode, sortDirection);
  const presentationOptions: {
    value: IngredientPresentation;
    label: string;
    Icon: LucideIcon;
  }[] = [
    { value: 'standard', label: 'Standard', Icon: List },
    { value: 'ingredient_first', label: 'Ingredient-first', Icon: Table2 },
  ];
  const sortOptions: { value: IngredientSortMode; label: string; Icon: LucideIcon }[] = [
    { value: 'instructions', label: 'Appears in Instructions', Icon: ListChecks },
    { value: 'alphabetical', label: 'Alphabetical', Icon: ArrowDownAZ },
    { value: 'size', label: 'By Size', Icon: Hash },
    { value: 'entered', label: 'Order Entered', Icon: ListOrdered },
  ];

  function renderMeasurements(
    ingredient: RecipeIngredient,
    displayIngredient: IngredientDisplayInput,
    defaultIngredient: IngredientDisplayInput,
    measurementTypes?: MeasurementType[],
  ) {
    const parts = getIngredientDisplayParts(displayIngredient, { aliasPinch: true });
    return parts.measurements
      .filter(
        (measurement) =>
          !measurementTypes || measurementTypes.includes(measurement.measurementType),
      )
      .map((measurement, index) => {
        const dimension =
          measurement.measurementType === 'volume' || measurement.measurementType === 'weight'
            ? measurement.measurementType
            : null;
        const defaultUnitCode = defaultIngredient.measurements?.find(
          (candidate) => candidate.measurement_type === measurement.measurementType,
        )?.unit_code;
        const isOverridden = Boolean(dimension && unitOverrides[ingredient.id]?.[dimension]);
        return (
          <Fragment key={`${measurement.measurementType}-${measurement.unitCode}`}>
            {index > 0 && ' / '}
            {renderFractionGlyphs(measurement.quantity)}
            {measurement.unitLabel && (
              <>
                {' '}
                {dimension && measurement.unitCode && defaultUnitCode ? (
                  <ReaderUnitPicklist
                    defaultUnitCode={defaultUnitCode}
                    dimension={dimension}
                    ingredientName={ingredient.ingredient_name}
                    isOverridden={isOverridden}
                    unitCode={measurement.unitCode}
                    unitLabel={measurement.unitLabel}
                    onSelect={(unitCode) =>
                      setIngredientOverride(ingredient.id, dimension, unitCode)
                    }
                  />
                ) : (
                  measurement.unitLabel
                )}
              </>
            )}
          </Fragment>
        );
      });
  }

  function renderIngredientCheck(ingredient: RecipeIngredient, inSeparateColumn = false) {
    const checked = Boolean(checkedIngredients[ingredient.id]);
    return (
      <label className="recipe-cook-checkbox recipe-screen-only">
        <input
          aria-label={`Mark ${ingredient.ingredient_name} complete`}
          checked={checked}
          style={inSeparateColumn ? { width: '13.333px', height: '13.333px' } : undefined}
          type="checkbox"
          onChange={(event) => {
            const isChecked = event.currentTarget.checked;
            setCheckedIngredients((current) => ({
              ...current,
              [ingredient.id]: isChecked,
            }));
          }}
        />
      </label>
    );
  }

  function renderIngredientRows() {
    return sortedIngredients.map((ingredient) => {
      const displayOptions = { multiplier, preserveStoredUnits, unitSystems };
      const displayIngredient = transformIngredientForDisplay(ingredient, {
        ...displayOptions,
        unitOverrides: unitOverrides[ingredient.id],
      });
      const defaultIngredient = transformIngredientForDisplay(ingredient, displayOptions);
      const parts = getIngredientDisplayParts(displayIngredient, { aliasPinch: true });
      const checked = Boolean(checkedIngredients[ingredient.id]);

      if (presentation === 'ingredient_first') {
        const hasDimensionalMeasurement = parts.measurements.some(
          (measurement) =>
            measurement.measurementType === 'volume' || measurement.measurementType === 'weight',
        );
        const hasVolumeMeasurement = parts.measurements.some(
          (measurement) => measurement.measurementType === 'volume',
        );
        const hasOtherMeasurement = parts.measurements.some(
          (measurement) =>
            measurement.measurementType === 'count' || measurement.measurementType === 'informal',
        );
        const otherMeasurements = renderMeasurements(
          ingredient,
          displayIngredient,
          defaultIngredient,
          ['count', 'informal'],
        );

        return (
          <tr data-checked={cookMode && checked ? 'true' : undefined} key={ingredient.id}>
            {cookMode && (
              <td className="recipe-cook-checkbox-cell" style={{ paddingTop: 0, paddingBottom: 0 }}>
                {renderIngredientCheck(ingredient, true)}
              </td>
            )}
            <th scope="row">
              <span className="recipe-reader-table-name">{parts.name}</span>
              {parts.specifics && (
                <span className="recipe-reader-specifics">
                  {parts.specifics.toLocaleLowerCase()}
                </span>
              )}
            </th>
            {hasDimensionalMeasurement ? (
              <>
                <td>
                  {hasOtherMeasurement && (
                    <>
                      {otherMeasurements}
                      {hasVolumeMeasurement && ' / '}
                    </>
                  )}
                  {renderMeasurements(ingredient, displayIngredient, defaultIngredient, ['volume'])}
                  {parts.unmeasuredPhrase && (
                    <>
                      {(hasOtherMeasurement || hasVolumeMeasurement) && ' / '}
                      {parts.unmeasuredPhrase}
                    </>
                  )}
                </td>
                <td>
                  {renderMeasurements(ingredient, displayIngredient, defaultIngredient, ['weight'])}
                </td>
              </>
            ) : (
              <td colSpan={2}>
                {otherMeasurements}
                {parts.unmeasuredPhrase && (
                  <>
                    {hasOtherMeasurement && ' '}
                    {parts.unmeasuredPhrase}
                  </>
                )}
              </td>
            )}
            <td>{parts.preparation}</td>
          </tr>
        );
      }

      return (
        <li data-checked={cookMode && checked ? 'true' : undefined} key={ingredient.id}>
          {cookMode && renderIngredientCheck(ingredient)}
          <span className="recipe-ingredient-name">
            {parts.measurements.length > 0 && (
              <>{renderMeasurements(ingredient, displayIngredient, defaultIngredient)} </>
            )}
            {[parts.specifics, parts.name].filter(Boolean).join(' ')}
            {parts.unmeasuredPhrase && ` ${parts.unmeasuredPhrase}`}
            {parts.preparation && `, ${parts.preparation}`}
          </span>
        </li>
      );
    });
  }

  const wakeStatusMessage =
    wakeStatus === 'unavailable'
      ? 'Screen may turn off because wake lock is not supported.'
      : wakeStatus === 'failed'
        ? 'Screen may turn off because wake lock could not be acquired.'
        : wakeStatus === 'released'
          ? 'Screen may turn off because the wake lock was released.'
          : '';
  const presentationIndex = presentationOptions.findIndex(
    (option) => option.value === presentation,
  );
  const currentPresentation =
    presentationOptions.find((option) => option.value === presentation) ?? presentationOptions[0];
  const nextPresentation =
    presentationOptions[(presentationIndex + 1) % presentationOptions.length] ??
    presentationOptions[0];
  const sortIndex = sortOptions.findIndex((option) => option.value === sortMode);
  const currentSort = sortOptions.find((option) => option.value === sortMode) ?? sortOptions[0];
  const nextSort = sortOptions[(sortIndex + 1) % sortOptions.length] ?? sortOptions[0];
  const PresentationIcon = currentPresentation.Icon;
  const SortIcon = currentSort.Icon;
  const DirectionIcon = sortDirection === 'ascending' ? ArrowUp : ArrowDown;
  const hasSortDirection = sortMode === 'alphabetical' || sortMode === 'size';
  const presentationSummary = presentation === 'ingredient_first' ? 'first' : 'standard';

  return (
    <div
      className={`recipe-reading-layout recipe-reading-${presentation}${instructions ? '' : ' recipe-reading-single'}`}
    >
      <section aria-labelledby="ingredients-title" className="recipe-detail-section">
        <div className="recipe-reader-heading">
          <div className="recipe-reader-heading-main">
            <h2 id="ingredients-title">Ingredients</h2>
            <div className="recipe-reader-controls recipe-screen-only">
              <button
                aria-hidden={!hasSortDirection}
                aria-label={`Sort ${sortDirection}`}
                aria-pressed={sortDirection === 'descending'}
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-reader-icon-button recipe-sort-direction"
                disabled={!hasSortDirection}
                style={{ visibility: hasSortDirection ? 'visible' : 'hidden' }}
                title={`Sort ${sortDirection}; activate to reverse`}
                type="button"
                onClick={() =>
                  setSortDirection((current) =>
                    current === 'ascending' ? 'descending' : 'ascending',
                  )
                }
              >
                <DirectionIcon aria-hidden="true" size={18} strokeWidth={1.9} />
              </button>
              <button
                aria-label={`Sort ingredients: ${currentSort.label}. Activate for ${nextSort.label}.`}
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-reader-icon-button"
                title={`Sort: ${currentSort.label}; next ${nextSort.label}`}
                type="button"
                onClick={() => setSortMode(nextSort.value)}
              >
                <SortIcon aria-hidden="true" size={16} strokeWidth={2} />
              </button>
              <button
                aria-label={`Ingredient view: ${currentPresentation.label}. Activate for ${nextPresentation.label}.`}
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-reader-icon-button"
                title={`Ingredient view: ${currentPresentation.label}; next ${nextPresentation.label}`}
                type="button"
                onClick={() => setPresentation(nextPresentation.value)}
              >
                <PresentationIcon aria-hidden="true" size={16} strokeWidth={2} />
              </button>
              <ReaderScaleButton serves={serves} />
              <button
                aria-checked={cookMode}
                aria-label="Cook mode"
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-reader-icon-button recipe-cook-toggle"
                role="switch"
                title={cookMode ? 'Exit Cook mode' : 'Enter Cook mode'}
                type="button"
                onClick={() => {
                  if (cookMode) {
                    setCookMode(false);
                    setCheckedIngredients({});
                    setWakeStatus('');
                  } else {
                    setCookMode(true);
                  }
                }}
              >
                <span aria-hidden="true" className="recipe-cook-toggle-icon">
                  <Laptop size={18} strokeWidth={2} />
                  <LockKeyhole className="recipe-cook-toggle-lock" size={10} strokeWidth={2.4} />
                </span>
              </button>
              {wakeStatusMessage && (
                <p aria-live="polite" className="recipe-cook-status" role="status">
                  <span>{wakeStatusMessage}</span>
                  <button
                    aria-label="Dismiss screen lock warning"
                    className="recipe-cook-status-dismiss"
                    title="Dismiss warning"
                    type="button"
                    onClick={() => setWakeStatus('')}
                  >
                    <X aria-hidden="true" size={15} />
                  </button>
                </p>
              )}
            </div>
          </div>
          <p className="recipe-reader-subtitle">
            {presentationSummary}, {currentSort.label.toLocaleLowerCase()}
            {wakeStatus === 'active' ? ', screen lock on' : ''}
          </p>
        </div>
        {presentation === 'ingredient_first' ? (
          <table
            aria-label="Recipe ingredients"
            className="recipe-ingredient-table recipe-ingredient-first-table"
          >
            <thead>
              <tr>
                {cookMode && <td aria-hidden="true" className="recipe-cook-checkbox-heading" />}
                <th scope="col">Ingredient</th>
                <th scope="col">
                  <span className="recipe-reader-label-desktop">Volume</span>
                  <span className="recipe-reader-label-mobile">Vol</span>
                </th>
                <th scope="col">
                  <span className="recipe-reader-label-desktop">Weight</span>
                  <span className="recipe-reader-label-mobile">Wt</span>
                </th>
                <th scope="col">
                  <span className="recipe-reader-label-desktop">Preparation</span>
                  <span className="recipe-reader-label-mobile">Prep</span>
                </th>
              </tr>
            </thead>
            <tbody>{renderIngredientRows()}</tbody>
          </table>
        ) : (
          <ol className="recipe-ingredient-list">{renderIngredientRows()}</ol>
        )}
      </section>
      {instructions}
    </div>
  );
}
