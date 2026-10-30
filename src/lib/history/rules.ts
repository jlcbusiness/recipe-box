export type HistoryEntity = 'recipe' | 'publication';

export type HistoryEventInput = {
  actor_user_id: string | null;
  event_type: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

export type HistoryChange = {
  label: string;
  before: string | null;
  after: string | null;
};

export type FormattedHistoryEvent = {
  action: string;
  actor: string;
  changes: HistoryChange[];
};

const fieldLabels: Record<string, string> = {
  name: 'Name',
  publication_type: 'Publication type',
  author: 'Author',
  edition: 'Edition',
  isbn: 'ISBN',
  retailer_url: 'Retailer URL',
  site_url: 'Website',
  publication_page: 'Publication location',
  recipe_url: 'Online recipe URL',
  state: 'State',
  occasion_details: 'Occasion details',
  reason: 'Reason',
  serves: 'Serves',
  makes_quantity: 'Makes quantity',
  makes_thing: 'Makes thing',
  prep_time_minutes: 'Prep time',
  mixing_time_minutes: 'Mixing time',
  marinate_time_minutes: 'Marinating time',
  chill_time_minutes: 'Chill time',
  freeze_time_minutes: 'Freeze time',
  cook_time_minutes: 'Cook time',
  bake_time_minutes: 'Bake time',
  cooling_time_minutes: 'Cooling time',
  rest_time_minutes: 'Rest time',
  total_time_minutes: 'Total time',
  notes_markdown: 'Notes',
  is_private: 'Sharing',
  ingredients: 'Ingredients',
  steps: 'Instructions',
  relationships: 'Relationships',
  tags: 'Tags',
  picklists: 'Classifications',
};

const hiddenFields = new Set([
  'account_id',
  'actor_user_id',
  'created_at',
  'id',
  'public_id',
  'trashed_at',
  'trashed_by_user_id',
  'updated_at',
  'version',
]);

function readableKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatMeasurement(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const amount = value.amount_min;
  const amountText =
    typeof amount === 'number' && typeof value.amount_max === 'number'
      ? `${amount}-${value.amount_max}`
      : typeof amount === 'number'
        ? String(amount)
        : '';
  const unit =
    typeof value.unit_code === 'string'
      ? value.unit_code
      : typeof value.picklist_value === 'string'
        ? value.picklist_value
        : '';
  return [amountText, unit].filter(Boolean).join(' ') || null;
}

function formatIngredient(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name : null;
  if (!name) return null;
  const measurements = Array.isArray(value.measurements)
    ? value.measurements.map(formatMeasurement).filter((item): item is string => item !== null)
    : [];
  const quantity = measurements.length > 0 ? ` (${measurements.join(' / ')})` : '';
  const detail = typeof value.detail === 'string' ? value.detail.trim() : '';
  const preparation = typeof value.preparation === 'string' ? value.preparation.trim() : '';
  const specifics = detail ? `, ${detail.toLocaleLowerCase()}` : '';
  const handling = preparation ? `, ${preparation.toLocaleLowerCase()}` : '';
  return `${name}${quantity}${specifics}${handling}`;
}

function formatPicklists(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const labels: Record<string, string> = {
    food_type: 'Food type',
    publication: 'Publication',
    meal_type: 'Meal type',
    cuisine: 'Cuisine',
    equipment: 'Equipment',
    verdict: 'Verdict',
    enthusiasm: 'Enthusiasm',
  };
  return Object.entries(labels)
    .flatMap(([key, label]) => {
      const item = value[key];
      if (Array.isArray(item)) {
        return item.length > 0 ? [`${label}: ${item.filter(isSimpleValue).join(', ')}`] : [];
      }
      return isSimpleValue(item) ? [`${label}: ${item}`] : [];
    })
    .join('; ');
}

function isSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (key === 'picklists') return formatPicklists(value) || 'Not set';
  if (key === 'ingredients' && Array.isArray(value)) {
    return value
      .map(formatIngredient)
      .filter((item): item is string => item !== null)
      .join('; ');
  }
  if (key === 'steps' && Array.isArray(value)) {
    return value
      .map((step) =>
        isRecord(step) && typeof step.plain_text === 'string'
          ? step.plain_text
          : isRecord(step) && typeof step.content_markdown === 'string'
            ? step.content_markdown
            : '',
      )
      .filter(Boolean)
      .join('; ');
  }
  if (key === 'tags' && Array.isArray(value)) {
    return value
      .map((tag) => (isRecord(tag) && typeof tag.name === 'string' ? tag.name : ''))
      .filter(Boolean)
      .join(', ');
  }
  if (key === 'relationships' && isRecord(value)) {
    const items = Object.values(value).flatMap((group) =>
      Array.isArray(group)
        ? group.map((item) =>
            isRecord(item) && typeof item.display_text === 'string' ? item.display_text : '',
          )
        : isRecord(group) && typeof group.display_text === 'string'
          ? [group.display_text]
          : [],
    );
    return items.filter(Boolean).join(', ') || 'Not set';
  }
  if (Array.isArray(value)) {
    return value.filter(isSimpleValue).join(', ') || 'Not set';
  }
  if (isRecord(value)) return null;
  if (typeof value === 'boolean' && key === 'is_private') return value ? 'Private' : 'Linkable';
  if (typeof value === 'number' && key.endsWith('_time_minutes')) return `${value} min`;
  if (isSimpleValue(value)) return String(value);
  return null;
}

function meaningfulEntries(data: Record<string, unknown>): [string, unknown][] {
  return Object.entries(data).filter(
    ([key, value]) =>
      !hiddenFields.has(key) &&
      !key.endsWith('_id') &&
      !key.endsWith('_at') &&
      value !== null &&
      value !== undefined &&
      value !== '',
  );
}

function eventAction(eventType: string, entity: HistoryEntity): string {
  const prefix = `${entity}.`;
  const action = eventType.startsWith(prefix) ? eventType.slice(prefix.length) : eventType;
  const knownActions: Record<string, string> = {
    created: 'created',
    updated: 'updated',
    trashed: 'moved to Trash',
    restored: 'restored',
    photo_added: 'photo added',
    photo_removed: 'photo removed',
    photo_reordered: 'photos reordered',
    cover_added: 'cover added',
    cover_updated: 'cover updated',
    cover_removed: 'cover removed',
  };
  return `${entity === 'recipe' ? 'Recipe' : 'Publication'} ${knownActions[action] ?? action.replaceAll('_', ' ')}`;
}

export function formatHistoryEvent(
  event: HistoryEventInput,
  entity: HistoryEntity,
): FormattedHistoryEvent {
  const changes: HistoryChange[] = [];
  const beforeData = event.before_data ?? {};
  const afterData = event.after_data ?? {};
  if (event.before_data === null) {
    for (const [key, value] of meaningfulEntries(afterData)) {
      const after = formatValue(key, value);
      if (after) changes.push({ label: fieldLabels[key] ?? readableKey(key), before: null, after });
    }
  } else {
    const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
    for (const key of keys) {
      if (hiddenFields.has(key) || key.endsWith('_id') || key.endsWith('_at')) continue;
      const before = formatValue(key, beforeData[key]);
      const after = formatValue(key, afterData[key]);
      if (before === after || (!before && !after)) continue;
      changes.push({ label: fieldLabels[key] ?? readableKey(key), before, after });
    }
  }

  return {
    action: eventAction(event.event_type, entity),
    actor: event.actor_user_id ? 'You' : 'Account unavailable',
    changes,
  };
}
