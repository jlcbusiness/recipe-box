'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import type { IngredientPresentation } from '../../lib/recipes/recipe-reader-rules';
import { saveUnitPreferences } from '../actions/unit-preferences';
import { Picklist, type PicklistOption } from '../picklist';

const unitSystemOptions: PicklistOption[] = [
  { value: 'us_customary', label: 'US customary' },
  { value: 'metric', label: 'Metric' },
];

const presentationOptions: PicklistOption[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'ingredient_first', label: 'Ingredient-first' },
];

export function UnitPreferences({
  ingredientPresentation,
  handPreference,
  volumeSystem,
  weightSystem,
}: {
  ingredientPresentation: IngredientPresentation;
  handPreference: 'left' | 'right';
  volumeSystem: MeasurementSystem;
  weightSystem: MeasurementSystem;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const changedDimensionRef = useRef<HTMLInputElement>(null);
  const volumeSystemRef = useRef<HTMLInputElement>(null);
  const weightSystemRef = useRef<HTMLInputElement>(null);
  const ingredientPresentationRef = useRef<HTMLInputElement>(null);
  const handPreferenceRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [preferences, setPreferences] = useState({
    volume: volumeSystem,
    weight: weightSystem,
    presentation: ingredientPresentation,
    hand: handPreference,
  });
  const [state, formAction, isPending] = useActionState(saveUnitPreferences, {});

  useEffect(() => {
    setPreferences({
      volume: volumeSystem,
      weight: weightSystem,
      presentation: ingredientPresentation,
      hand: handPreference,
    });
  }, [handPreference, ingredientPresentation, volumeSystem, weightSystem]);

  useEffect(() => {
    if (state.status === 'saved') {
      router.refresh();
    } else if (state.status === 'error') {
      setPreferences({
        volume: volumeSystem,
        weight: weightSystem,
        presentation: ingredientPresentation,
        hand: handPreference,
      });
    }
  }, [handPreference, ingredientPresentation, router, state, volumeSystem, weightSystem]);

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

  return (
    <div className="settings-unit-preferences">
      <form
        action={formAction}
        aria-busy={isPending}
        className="settings-unit-preferences-form"
        ref={formRef}
      >
        <input name="changed_dimension" ref={changedDimensionRef} type="hidden" value="volume" />
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
      </form>
      <p aria-live="polite" className="settings-unit-status" role="status">
        {isPending ? 'Saving...' : state.message}
      </p>
    </div>
  );
}
