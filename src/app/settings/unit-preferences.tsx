'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import { saveUnitPreferences } from '../actions/unit-preferences';
import { Picklist, type PicklistOption } from '../picklist';

const unitSystemOptions: PicklistOption[] = [
  { value: 'us_customary', label: 'US customary' },
  { value: 'metric', label: 'Metric' },
];

export function UnitPreferences({
  volumeSystem,
  weightSystem,
}: {
  volumeSystem: MeasurementSystem;
  weightSystem: MeasurementSystem;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const changedDimensionRef = useRef<HTMLInputElement>(null);
  const volumeSystemRef = useRef<HTMLInputElement>(null);
  const weightSystemRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [systems, setSystems] = useState({ volume: volumeSystem, weight: weightSystem });
  const [state, formAction, isPending] = useActionState(saveUnitPreferences, {});

  useEffect(() => {
    setSystems({ volume: volumeSystem, weight: weightSystem });
  }, [volumeSystem, weightSystem]);

  useEffect(() => {
    if (state.status === 'saved') {
      router.refresh();
    } else if (state.status === 'error') {
      setSystems({ volume: volumeSystem, weight: weightSystem });
    }
  }, [router, state, volumeSystem, weightSystem]);

  function updateSystem(dimension: 'volume' | 'weight', value: string) {
    const system = value as MeasurementSystem;
    setSystems((current) => ({ ...current, [dimension]: system }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = dimension;
    }
    const systemRef = dimension === 'volume' ? volumeSystemRef : weightSystemRef;
    if (systemRef.current) {
      systemRef.current.value = system;
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
        <input name="volume_system" ref={volumeSystemRef} type="hidden" value={systems.volume} />
        <input name="weight_system" ref={weightSystemRef} type="hidden" value={systems.weight} />
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
            value={systems.volume}
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
            value={systems.weight}
          />
        </div>
      </form>
      <p aria-live="polite" className="settings-unit-status" role="status">
        {isPending ? 'Saving...' : state.message}
      </p>
    </div>
  );
}
