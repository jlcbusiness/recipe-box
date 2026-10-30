import type {
  RecipeSearchColumnSelections,
  RecipeSearchFilter,
  RecipeSearchSortKey,
} from '../../lib/recipes/search';
import { RecipeMarkerIcon } from './recipe-marker-icons';

const markerFilters = [
  { field: 'starred', marker: 'star', label: 'Star' },
  { field: 'hearted', marker: 'heart', label: 'Heart' },
] as const;

export function RecipeMarkerFilters({
  action,
  columnSelections,
  direction,
  filters,
  query,
  sort,
  tab,
  view,
}: {
  action: string;
  columnSelections: RecipeSearchColumnSelections;
  direction: 'asc' | 'desc';
  filters: RecipeSearchFilter[];
  query?: string;
  sort: RecipeSearchSortKey;
  tab?: string;
  view: 'details' | 'grid' | 'list';
}) {
  const keyedFilters = (() => {
    const occurrences = new Map<string, number>();
    return markerFilters.map(({ field, label, marker }) => {
      const active = filters.some(
        (filter) =>
          filter.field === field &&
          filter.operator === 'is' &&
          Array.isArray(filter.value) &&
          filter.value.includes('true'),
      );
      const nextFilters = filters.filter((filter) => filter.field !== field);
      if (!active) {
        nextFilters.push({ field, operator: 'is', value: ['true'] });
      }

      const serializedFilters = nextFilters.map((filter) => {
        const serialized = JSON.stringify(filter);
        const occurrence = occurrences.get(serialized) ?? 0;
        occurrences.set(serialized, occurrence + 1);
        return { filter, key: `${serialized}-${occurrence}` };
      });

      return { active, field, label, marker, serializedFilters };
    });
  })();

  return (
    <fieldset className="recipe-marker-filters" data-tab={tab}>
      <legend className="visually-hidden">Filter by recipe markers</legend>
      {keyedFilters.map(({ active, field, label, marker, serializedFilters }) => (
        <form action={action} key={field} method="get">
          {query !== undefined && query && <input name="q" type="hidden" value={query} />}
          {tab && <input name="tab" type="hidden" value={tab} />}
          <input name="sort" type="hidden" value={sort} />
          <input name="direction" type="hidden" value={direction} />
          <input name="view" type="hidden" value={view} />
          {Object.entries(columnSelections).flatMap(([key, values]) => {
            if (values === undefined) return [];
            const name = `column_${key}`;
            return values.length === 0
              ? [<input key={name} name={name} type="hidden" value="__none__" />]
              : values.map((value) => (
                  <input key={`${name}-${value}`} name={name} type="hidden" value={value} />
                ));
          })}
          {serializedFilters.map(({ filter, key }) => (
            <input key={key} name="filter" type="hidden" value={JSON.stringify(filter)} />
          ))}
          <button
            aria-label={`Filter recipes by ${label}`}
            aria-pressed={active}
            className="recipe-marker-filter-toggle"
            data-marker={field}
            type="submit"
          >
            <RecipeMarkerIcon marker={marker} size={19} />
          </button>
        </form>
      ))}
    </fieldset>
  );
}
