import {
  formatNutritionString,
  getNutrientDisplay,
  NUTRITION_FACTS_MACRO_ROWS,
  NUTRITION_LABEL_SECTIONS,
  type NutrientDisplay,
  type NutrientValues,
  type NutritionFactsRow,
} from '../../lib/recipes/nutrition-rules';

type FactsRow = NutritionFactsRow & { display: NutrientDisplay };

function toFactsRows(values: NutrientValues, rows: readonly NutritionFactsRow[]): FactsRow[] {
  return rows.flatMap((row) => {
    const amount = values[row.key];
    const display = amount === undefined ? null : getNutrientDisplay(row.key, amount);
    return display ? [{ ...row, display }] : [];
  });
}

function FactsRowItem({ row, sectionStart = false }: { row: FactsRow; sectionStart?: boolean }) {
  const className = [
    'recipe-nutrition-facts-row',
    row.level === 1 ? 'is-indent-1' : '',
    row.level === 2 ? 'is-indent-2' : '',
    row.bold ? 'is-bold' : '',
    sectionStart ? 'is-section-start' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <dt>{row.display.label}</dt>
      <dd className="recipe-nutrition-facts-amount">{row.display.amountText}</dd>
      {row.display.percentText && (
        <dd className="recipe-nutrition-facts-percent">{row.display.percentText}</dd>
      )}
    </div>
  );
}

// Desktop and print use the compact string; narrow screens use a Nutrition Facts-style list.
export function NutritionEstimate({ label, values }: { label: string; values: NutrientValues }) {
  const formatted = formatNutritionString(values);
  if (!formatted) return null;
  const calories = toFactsRows(values, [{ key: 'calories', level: 0, bold: true }])[0];
  const macroRows = toFactsRows(values, NUTRITION_FACTS_MACRO_ROWS);
  const vitaminRows = toFactsRows(
    values,
    (NUTRITION_LABEL_SECTIONS[2] ?? []).flat().map((key) => ({ key, level: 0, bold: false })),
  );
  const hasPercent = [...macroRows, ...vitaminRows].some((row) => row.display.percentText);

  return (
    <>
      <p className="recipe-nutrition-estimate recipe-nutrition-string">
        <span className="recipe-nutrition-estimate-label">{label}: </span>
        {formatted}
      </p>
      <div className="recipe-nutrition-estimate recipe-nutrition-facts">
        <p className="recipe-nutrition-estimate-label recipe-nutrition-facts-caption">{label}</p>
        {calories && (
          <dl>
            <div className="recipe-nutrition-facts-row is-calories">
              <dt>{calories.display.label}</dt>
              <dd className="recipe-nutrition-facts-amount">{calories.display.amountText}</dd>
            </div>
          </dl>
        )}
        {hasPercent && <p className="recipe-nutrition-facts-dv">% Daily Value</p>}
        <dl>
          {macroRows.map((row) => (
            <FactsRowItem key={row.key} row={row} />
          ))}
          {vitaminRows.map((row, index) => (
            <FactsRowItem key={row.key} row={row} sectionStart={index === 0} />
          ))}
        </dl>
      </div>
    </>
  );
}
