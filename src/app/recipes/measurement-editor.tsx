'use client';

import { useId } from 'react';
import type { RecipePicklistValue } from '../../lib/recipes/data';
import {
  type MeasurementDraft,
  type MeasurementType,
  serializeMeasurements,
  volumeUnits,
  weightUnits,
} from '../../lib/recipes/measurement-rules';

const measurementTypes: { value: MeasurementType; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'weight', label: 'Weight' },
  { value: 'count', label: 'Count' },
  { value: 'informal', label: 'Informal' },
  { value: 'unmeasured', label: 'Unmeasured' },
];

function createMeasurement(): MeasurementDraft {
  return {
    id: crypto.randomUUID(),
    type: '',
    quantity: '',
    unitCode: '',
    picklistValueId: '',
  };
}

function unitDefault(type: MeasurementType): string {
  return type === 'volume' ? 'cup' : type === 'weight' ? 'g' : '';
}

export function MeasurementEditor({
  rowNumber,
  measurements,
  picklists,
  validate,
  onChange,
}: {
  rowNumber: number;
  measurements: MeasurementDraft[];
  picklists: RecipePicklistValue[];
  validate: boolean;
  onChange: (measurements: MeasurementDraft[]) => void;
}) {
  const editorId = useId();
  let validationError: string | null = null;
  if (validate) {
    try {
      serializeMeasurements(measurements);
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Check this measurement.';
    }
  }

  const informalOptions = picklists.filter((option) => option.category === 'informal_unit');
  const phraseOptions = picklists.filter((option) => option.category === 'unmeasured_phrase');
  const canAddMeasurement =
    measurements.length === 0 ||
    (measurements.length === 1 &&
      (measurements[0].type === 'volume' || measurements[0].type === 'weight'));

  function updateMeasurement(index: number, update: Partial<MeasurementDraft>) {
    onChange(
      measurements.map((measurement, currentIndex) =>
        currentIndex === index ? { ...measurement, ...update } : measurement,
      ),
    );
  }

  function changeType(index: number, type: MeasurementType) {
    updateMeasurement(index, {
      type,
      quantity: '',
      unitCode: unitDefault(type),
      picklistValueId: '',
    });
  }

  return (
    <fieldset
      aria-label={`Measurements for ingredient row ${rowNumber}`}
      className="recipe-measurement-editor"
    >
      <legend className="visually-hidden">Measurements for ingredient row {rowNumber}</legend>
      {measurements.map((measurement, index) => {
        const amountId = `${editorId}-amount-${index}`;
        const typeId = `${editorId}-type-${index}`;
        const invalid = Boolean(validationError && measurement.type);
        const describedBy = invalid ? `${editorId}-error` : undefined;

        return (
          <div className="recipe-measurement-entry" key={measurement.id}>
            <fieldset
              aria-describedby={describedBy}
              className="recipe-measurement-types"
              id={typeId}
            >
              <legend className="visually-hidden">
                Measurement type, row {rowNumber}, measurement {index + 1}
              </legend>
              {measurementTypes.map((option) => (
                <label className="recipe-measurement-type-option" key={option.value}>
                  <input
                    aria-label={`${option.label}, row ${rowNumber}, measurement ${index + 1}`}
                    checked={measurement.type === option.value}
                    name={`${editorId}-measurement-${index}`}
                    type="radio"
                    value={option.value}
                    onChange={() => changeType(index, option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            {measurement.type && measurement.type !== 'unmeasured' && (
              <label className="recipe-measurement-control" htmlFor={amountId}>
                <span className="visually-hidden">
                  Amount, row {rowNumber}, measurement {index + 1}
                </span>
                <input
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  autoComplete="off"
                  id={amountId}
                  inputMode="text"
                  type="text"
                  value={measurement.quantity}
                  onChange={(event) => updateMeasurement(index, { quantity: event.target.value })}
                />
              </label>
            )}
            {(measurement.type === 'volume' || measurement.type === 'weight') && (
              <label className="recipe-measurement-control">
                <span className="visually-hidden">
                  Measurement unit, row {rowNumber}, measurement {index + 1}
                </span>
                <select
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={measurement.unitCode}
                  onChange={(event) => updateMeasurement(index, { unitCode: event.target.value })}
                >
                  {measurement.type === 'volume' ? (
                    <>
                      <optgroup label="US customary">
                        {volumeUnits
                          .filter((unit) => unit.system === 'us_customary')
                          .map((unit) => (
                            <option key={unit.code} value={unit.code}>
                              {unit.label} ({unit.abbreviation})
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Metric">
                        {volumeUnits
                          .filter((unit) => unit.system === 'metric')
                          .map((unit) => (
                            <option key={unit.code} value={unit.code}>
                              {unit.label} ({unit.abbreviation})
                            </option>
                          ))}
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <optgroup label="US customary">
                        {weightUnits
                          .filter((unit) => unit.system === 'us_customary')
                          .map((unit) => (
                            <option key={unit.code} value={unit.code}>
                              {unit.label} ({unit.abbreviation})
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Metric">
                        {weightUnits
                          .filter((unit) => unit.system === 'metric')
                          .map((unit) => (
                            <option key={unit.code} value={unit.code}>
                              {unit.label} ({unit.abbreviation})
                            </option>
                          ))}
                      </optgroup>
                    </>
                  )}
                </select>
              </label>
            )}
            {measurement.type === 'informal' && (
              <label className="recipe-measurement-control">
                <span className="visually-hidden">
                  Informal unit, row {rowNumber}, measurement {index + 1}
                </span>
                <select
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={measurement.picklistValueId}
                  onChange={(event) =>
                    updateMeasurement(index, { picklistValueId: event.target.value })
                  }
                >
                  <option value="">Choose a unit</option>
                  {informalOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {measurement.type === 'unmeasured' && (
              <label className="recipe-measurement-control">
                <span className="visually-hidden">
                  Unmeasured phrase, row {rowNumber}, measurement {index + 1}
                </span>
                <select
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={measurement.picklistValueId}
                  onChange={(event) =>
                    updateMeasurement(index, { picklistValueId: event.target.value })
                  }
                >
                  <option value="">Choose a phrase</option>
                  {phraseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {measurements.length > 1 && (
              <button
                aria-label={`Remove measurement ${index + 1}, row ${rowNumber}`}
                className="recipe-measurement-remove"
                type="button"
                onClick={() =>
                  onChange(measurements.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {canAddMeasurement && (
        <button
          className="recipe-measurement-add"
          type="button"
          aria-label={`Add measurement, row ${rowNumber}`}
          onClick={() => onChange([...measurements, createMeasurement()])}
        >
          + Add measurement
        </button>
      )}
      {validationError && (
        <p className="recipe-measurement-error" id={`${editorId}-error`} role="alert">
          {validationError}
        </p>
      )}
    </fieldset>
  );
}
