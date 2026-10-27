'use client';

import { Ban, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  defaultInstructionEmphasis,
  type InstructionEmphasisColor,
  instructionEmphasisOptions,
} from '../../lib/recipes/instruction-emphasis';
import type { TemperatureSystem } from '../../lib/recipes/instruction-markdown';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import type { IngredientPresentation } from '../../lib/recipes/recipe-reader-rules';
import { saveUnitPreferences } from '../actions/unit-preferences';
import { Picklist, type PicklistOption } from '../picklist';

const unitSystemOptions: PicklistOption[] = [
  { value: 'us_customary', label: 'US customary' },
  { value: 'metric', label: 'Metric' },
];

const temperatureSystemOptions: PicklistOption[] = [
  { value: 'fahrenheit', label: 'Fahrenheit' },
  { value: 'celsius', label: 'Celsius' },
];

const presentationOptions: PicklistOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ingredient_first', label: 'Ingredient-first' },
];

const instructionColorDimensions = [
  {
    dimension: 'ingredient_color',
    label: 'Ingredient color',
    preferenceKey: 'ingredientColor',
  },
  {
    dimension: 'temperature_color',
    label: 'Temperature color',
    preferenceKey: 'temperatureColor',
  },
  {
    dimension: 'duration_color',
    label: 'Duration color',
    preferenceKey: 'durationColor',
  },
] as const;

export function UnitPreferences({
  durationColor,
  includeInstructionPhotosInPrivatePrint = true,
  ingredientPresentation,
  ingredientColor,
  handPreference,
  privatePrintUsesColors,
  temperatureColor,
  temperatureSystem,
  volumeSystem,
  weightSystem,
}: {
  durationColor: InstructionEmphasisColor;
  ingredientPresentation: IngredientPresentation;
  ingredientColor: InstructionEmphasisColor;
  handPreference: 'left' | 'right';
  includeInstructionPhotosInPrivatePrint?: boolean;
  privatePrintUsesColors: boolean;
  temperatureColor: InstructionEmphasisColor;
  temperatureSystem: TemperatureSystem;
  volumeSystem: MeasurementSystem;
  weightSystem: MeasurementSystem;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const changedDimensionRef = useRef<HTMLInputElement>(null);
  const volumeSystemRef = useRef<HTMLInputElement>(null);
  const weightSystemRef = useRef<HTMLInputElement>(null);
  const temperatureSystemRef = useRef<HTMLInputElement>(null);
  const ingredientPresentationRef = useRef<HTMLInputElement>(null);
  const handPreferenceRef = useRef<HTMLInputElement>(null);
  const ingredientColorRef = useRef<HTMLInputElement>(null);
  const temperatureColorRef = useRef<HTMLInputElement>(null);
  const durationColorRef = useRef<HTMLInputElement>(null);
  const allEmphasisDisabledRef = useRef<HTMLInputElement>(null);
  const privatePrintUsesColorsRef = useRef<HTMLInputElement>(null);
  const includeInstructionPhotosRef = useRef<HTMLInputElement>(null);
  const emphasisPickerRef = useRef<HTMLDivElement>(null);
  const activeEmphasisTriggerRef = useRef<HTMLButtonElement>(null);
  const emphasisPaletteId = useId();
  const router = useRouter();
  const resolvedTemperatureSystem = temperatureSystem === 'celsius' ? 'celsius' : 'fahrenheit';
  const [openColorDimension, setOpenColorDimension] = useState<
    (typeof instructionColorDimensions)[number]['dimension'] | null
  >(null);
  const [preferences, setPreferences] = useState({
    volume: volumeSystem,
    weight: weightSystem,
    temperature: resolvedTemperatureSystem,
    presentation: ingredientPresentation,
    hand: handPreference,
    ingredientColor,
    temperatureColor,
    durationColor,
    privatePrintUsesColors,
    includeInstructionPhotosInPrivatePrint,
  });
  const [state, formAction, isPending] = useActionState(saveUnitPreferences, {});

  useEffect(() => {
    setPreferences({
      volume: volumeSystem,
      weight: weightSystem,
      temperature: resolvedTemperatureSystem,
      presentation: ingredientPresentation,
      hand: handPreference,
      ingredientColor,
      temperatureColor,
      durationColor,
      privatePrintUsesColors,
      includeInstructionPhotosInPrivatePrint,
    });
  }, [
    durationColor,
    handPreference,
    ingredientColor,
    ingredientPresentation,
    privatePrintUsesColors,
    includeInstructionPhotosInPrivatePrint,
    temperatureColor,
    resolvedTemperatureSystem,
    volumeSystem,
    weightSystem,
  ]);

  useEffect(() => {
    if (state.status === 'saved') {
      router.refresh();
    } else if (state.status === 'error') {
      setPreferences({
        volume: volumeSystem,
        weight: weightSystem,
        temperature: resolvedTemperatureSystem,
        presentation: ingredientPresentation,
        hand: handPreference,
        ingredientColor,
        temperatureColor,
        durationColor,
        privatePrintUsesColors,
        includeInstructionPhotosInPrivatePrint,
      });
    }
  }, [
    durationColor,
    handPreference,
    ingredientColor,
    ingredientPresentation,
    privatePrintUsesColors,
    includeInstructionPhotosInPrivatePrint,
    router,
    state,
    temperatureColor,
    resolvedTemperatureSystem,
    volumeSystem,
    weightSystem,
  ]);

  useEffect(() => {
    if (!openColorDimension) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!emphasisPickerRef.current?.contains(event.target as Node)) {
        setOpenColorDimension(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenColorDimension(null);
      activeEmphasisTriggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openColorDimension]);

  function updateSystem(dimension: 'volume' | 'weight', value: string) {
    const system = value as MeasurementSystem;
    setPreferences((current) => ({ ...current, [dimension]: system }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = dimension;
    }
    const systemRef = dimension === 'volume' ? volumeSystemRef : weightSystemRef;
    if (systemRef.current) {
      systemRef.current.value = system;
    }
    formRef.current?.requestSubmit();
  }

  function updateTemperatureSystem(value: string) {
    const system = value as TemperatureSystem;
    setPreferences((current) => ({ ...current, temperature: system }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'temperature';
    }
    if (temperatureSystemRef.current) {
      temperatureSystemRef.current.value = system;
    }
    formRef.current?.requestSubmit();
  }

  function updatePresentation(value: string) {
    const presentation = value as IngredientPresentation;
    setPreferences((current) => ({ ...current, presentation }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'presentation';
    }
    if (ingredientPresentationRef.current) {
      ingredientPresentationRef.current.value = presentation;
    }
    formRef.current?.requestSubmit();
  }

  function updateHand(hand: 'left' | 'right') {
    setPreferences((current) => ({ ...current, hand }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'hand';
    }
    if (handPreferenceRef.current) {
      handPreferenceRef.current.value = hand;
    }
    formRef.current?.requestSubmit();
  }

  function updateColor(
    dimension: 'ingredient_color' | 'temperature_color' | 'duration_color',
    value: InstructionEmphasisColor,
  ) {
    const stateKey = `${dimension.replace('_color', '')}Color` as
      | 'ingredientColor'
      | 'temperatureColor'
      | 'durationColor';
    const inputRef =
      dimension === 'ingredient_color'
        ? ingredientColorRef
        : dimension === 'temperature_color'
          ? temperatureColorRef
          : durationColorRef;
    setPreferences((current) => ({ ...current, [stateKey]: value }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = dimension;
    }
    if (inputRef.current) {
      inputRef.current.value = value;
    }
    formRef.current?.requestSubmit();
  }

  function updateAllEmphasis(turnedOff: boolean) {
    const colors: Record<'ingredient' | 'temperature' | 'duration', InstructionEmphasisColor> =
      turnedOff
        ? { ingredient: 'none', temperature: 'none', duration: 'none' }
        : defaultInstructionEmphasis;
    setPreferences((current) => ({
      ...current,
      ingredientColor: colors.ingredient,
      temperatureColor: colors.temperature,
      durationColor: colors.duration,
    }));
    setOpenColorDimension(null);
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'instruction_emphasis';
    }
    if (allEmphasisDisabledRef.current) {
      allEmphasisDisabledRef.current.value = String(turnedOff);
    }
    for (const [inputRef, value] of [
      [ingredientColorRef, colors.ingredient],
      [temperatureColorRef, colors.temperature],
      [durationColorRef, colors.duration],
    ] as const) {
      if (inputRef.current) {
        inputRef.current.value = value;
      }
    }
    formRef.current?.requestSubmit();
  }

  function updatePrivatePrintUsesColors(value: boolean) {
    setPreferences((current) => ({ ...current, privatePrintUsesColors: value }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'print_colors';
    }
    if (privatePrintUsesColorsRef.current) {
      privatePrintUsesColorsRef.current.value = String(value);
    }
    formRef.current?.requestSubmit();
  }

  function updateIncludeInstructionPhotos(value: boolean) {
    setPreferences((current) => ({ ...current, includeInstructionPhotosInPrivatePrint: value }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = 'print_photos';
    }
    if (includeInstructionPhotosRef.current) {
      includeInstructionPhotosRef.current.value = String(value);
    }
    formRef.current?.requestSubmit();
  }

  const activeColorPreference = instructionColorDimensions.find(
    ({ dimension }) => dimension === openColorDimension,
  );

  return (
    <div className="settings-unit-preferences">
      <form
        action={formAction}
        aria-busy={isPending}
        className="settings-unit-preferences-form"
        ref={formRef}
      >
        <input
          defaultValue="volume"
          name="changed_dimension"
          ref={changedDimensionRef}
          type="hidden"
        />
        <input
          defaultValue="false"
          name="all_emphasis_disabled"
          ref={allEmphasisDisabledRef}
          type="hidden"
        />
        <input
          name="volume_system"
          ref={volumeSystemRef}
          type="hidden"
          value={preferences.volume}
        />
        <input
          name="weight_system"
          ref={weightSystemRef}
          type="hidden"
          value={preferences.weight}
        />
        <input
          name="temperature_system"
          ref={temperatureSystemRef}
          type="hidden"
          value={preferences.temperature}
        />
        <input
          name="ingredient_presentation"
          ref={ingredientPresentationRef}
          type="hidden"
          value={preferences.presentation}
        />
        <input
          name="hand_preference"
          ref={handPreferenceRef}
          type="hidden"
          value={preferences.hand}
        />
        <input
          name="ingredient_color"
          ref={ingredientColorRef}
          type="hidden"
          value={preferences.ingredientColor}
        />
        <input
          name="temperature_color"
          ref={temperatureColorRef}
          type="hidden"
          value={preferences.temperatureColor}
        />
        <input
          name="duration_color"
          ref={durationColorRef}
          type="hidden"
          value={preferences.durationColor}
        />
        <input
          name="private_print_uses_colors"
          ref={privatePrintUsesColorsRef}
          type="hidden"
          value={String(preferences.privatePrintUsesColors)}
        />
        <input
          name="include_instruction_photos_in_private_print"
          ref={includeInstructionPhotosRef}
          type="hidden"
          value={String(preferences.includeInstructionPhotosInPrivatePrint)}
        />
        <div className="settings-preference-group">
          <div className="settings-unit-preference-fields">
            <div className="settings-unit-field">
              <span className="settings-unit-label">Volume</span>
              <Picklist
                className="settings-unit-picklist"
                disabled={isPending}
                label="Volume"
                measureLabel="US customary"
                menuClassName="settings-unit-picklist-menu"
                onSelect={(value) => updateSystem('volume', value)}
                options={unitSystemOptions}
                value={preferences.volume}
              />
            </div>
            <div className="settings-unit-field">
              <span className="settings-unit-label">Weight</span>
              <Picklist
                className="settings-unit-picklist"
                disabled={isPending}
                label="Weight"
                measureLabel="US customary"
                menuClassName="settings-unit-picklist-menu"
                onSelect={(value) => updateSystem('weight', value)}
                options={unitSystemOptions}
                value={preferences.weight}
              />
            </div>
            <div className="settings-unit-field">
              <span className="settings-unit-label">Temperature</span>
              <Picklist
                className="settings-unit-picklist"
                disabled={isPending}
                label="Temperature"
                measureLabel="Fahrenheit"
                menuClassName="settings-unit-picklist-menu"
                onSelect={updateTemperatureSystem}
                options={temperatureSystemOptions}
                value={preferences.temperature}
              />
            </div>
          </div>
        </div>
        <div className="settings-preference-group">
          <div className="settings-unit-preference-fields">
            <div className="settings-unit-field">
              <span className="settings-unit-label">View</span>
              <Picklist
                className="settings-unit-picklist"
                disabled={isPending}
                label="View"
                measureLabel="Standard"
                menuClassName="settings-unit-picklist-menu"
                onSelect={updatePresentation}
                options={presentationOptions}
                value={preferences.presentation}
              />
            </div>
          </div>
        </div>
        <div className="settings-preference-group settings-hand-preference-group">
          <div className="settings-unit-preference-fields">
            <fieldset className="settings-unit-field settings-hand-preference">
              <legend className="settings-unit-label">Hand</legend>
              <div className="settings-hand-toggle">
                <button
                  aria-pressed={preferences.hand === 'left'}
                  disabled={isPending}
                  onClick={() => updateHand('left')}
                  type="button"
                >
                  Left
                </button>
                <button
                  aria-pressed={preferences.hand === 'right'}
                  disabled={isPending}
                  onClick={() => updateHand('right')}
                  type="button"
                >
                  Right
                </button>
              </div>
            </fieldset>
          </div>
        </div>
        <div className="settings-preference-group settings-instruction-emphasis">
          <div className="settings-instruction-emphasis-layout">
            <div className="settings-instruction-emphasis-column">
              <h3>Instruction emphasis</h3>
              <div className="settings-emphasis-preferences" ref={emphasisPickerRef}>
                <div className="settings-emphasis-fields">
                  {instructionColorDimensions.map(({ dimension, label, preferenceKey }) => {
                    const value = preferences[preferenceKey];
                    const selectedOption = instructionEmphasisOptions.find(
                      (option) => option.value === value,
                    );
                    const isOpen = openColorDimension === dimension;

                    return (
                      <fieldset
                        aria-labelledby={`${emphasisPaletteId}-${dimension}-label`}
                        className="settings-emphasis-row"
                        key={dimension}
                      >
                        <span
                          className="settings-emphasis-label"
                          id={`${emphasisPaletteId}-${dimension}-label`}
                        >
                          {label}
                        </span>
                        <div className="settings-emphasis-picker">
                          <button
                            aria-controls={emphasisPaletteId}
                            aria-expanded={isOpen}
                            aria-label={`${label}: ${selectedOption?.label ?? 'None'}`}
                            className={`settings-emphasis-swatch settings-emphasis-trigger${value === 'none' ? ' is-none' : ''}`}
                            disabled={isPending}
                            ref={isOpen ? activeEmphasisTriggerRef : null}
                            style={
                              selectedOption?.color
                                ? { backgroundColor: selectedOption.color }
                                : undefined
                            }
                            title={`Change ${label.toLowerCase()}`}
                            type="button"
                            onClick={() =>
                              setOpenColorDimension((current) =>
                                current === dimension ? null : dimension,
                              )
                            }
                          >
                            {value === 'none' ? (
                              <Ban aria-hidden="true" size={17} strokeWidth={1.8} />
                            ) : (
                              <Check aria-hidden="true" size={16} strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
                <fieldset
                  aria-label={`${activeColorPreference?.label ?? 'Instruction color'} choices`}
                  className="settings-emphasis-palette"
                  hidden={!activeColorPreference}
                  id={emphasisPaletteId}
                >
                  <legend className="settings-emphasis-palette-legend">
                    {activeColorPreference?.label ?? 'Instruction color'}
                  </legend>
                  <div className="settings-emphasis-palette-grid">
                    {instructionEmphasisOptions.map((option) => (
                      <button
                        aria-label={`Set ${activeColorPreference?.label.toLowerCase() ?? 'instruction color'} to ${option.label}`}
                        aria-pressed={
                          activeColorPreference !== undefined &&
                          preferences[activeColorPreference.preferenceKey] === option.value
                        }
                        className={`settings-emphasis-swatch${option.value === 'none' ? ' is-none' : ''}`}
                        disabled={isPending || !activeColorPreference}
                        key={option.value}
                        onClick={() => {
                          if (!activeColorPreference) return;
                          updateColor(activeColorPreference.dimension, option.value);
                          setOpenColorDimension(null);
                          activeEmphasisTriggerRef.current?.focus();
                        }}
                        style={option.color ? { backgroundColor: option.color } : undefined}
                        title={option.label}
                        type="button"
                      >
                        {activeColorPreference &&
                          preferences[activeColorPreference.preferenceKey] === option.value &&
                          option.value !== 'none' && (
                            <Check aria-hidden="true" size={16} strokeWidth={2.5} />
                          )}
                        {option.value === 'none' ? (
                          <Ban aria-hidden="true" size={17} strokeWidth={1.8} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <label className="settings-emphasis-toggle">
                <input
                  checked={
                    preferences.ingredientColor === 'none' &&
                    preferences.temperatureColor === 'none' &&
                    preferences.durationColor === 'none'
                  }
                  disabled={isPending}
                  onChange={(event) => updateAllEmphasis(event.currentTarget.checked)}
                  type="checkbox"
                />
                Turn off all emphasis
              </label>
            </div>
            <section
              aria-labelledby="settings-print-options-title"
              className="settings-print-options"
            >
              <h3 id="settings-print-options-title">Print options</h3>
              <div className="settings-print-options-list">
                <label className="settings-print-emphasis-toggle">
                  <input
                    checked={!preferences.privatePrintUsesColors}
                    disabled={isPending}
                    onChange={(event) => updatePrivatePrintUsesColors(!event.currentTarget.checked)}
                    type="checkbox"
                  />
                  Omit instruction emphasis when printing
                </label>
                <label className="settings-print-emphasis-toggle">
                  <input
                    checked={!preferences.includeInstructionPhotosInPrivatePrint}
                    disabled={isPending}
                    onChange={(event) =>
                      updateIncludeInstructionPhotos(!event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  Omit instruction photos when printing
                </label>
              </div>
            </section>
          </div>
        </div>
      </form>
      <p aria-live="polite" className="settings-unit-status" role="status">
        {isPending ? 'Saving...' : state.message}
      </p>
    </div>
  );
}
