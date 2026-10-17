import {
  formatHistoryEvent,
  type HistoryEntity,
  type HistoryEventInput,
} from '../../lib/history/rules';

export type HistoryEventRow = HistoryEventInput & { created_at: string; id: string };

export function HistoryEvents({
  entity,
  events,
}: {
  entity: HistoryEntity;
  events: HistoryEventRow[];
}) {
  if (events.length === 0) {
    return (
      <p className="recipe-history-empty">No history has been recorded for this {entity} yet.</p>
    );
  }

  return (
    <ol
      aria-label={`${entity === 'recipe' ? 'Recipe' : 'Publication'} history`}
      className="recipe-history-list"
    >
      {events.map((event) => {
        const formatted = formatHistoryEvent(event, entity);
        return (
          <li key={event.id}>
            <article className="recipe-history-event">
              <header className="recipe-history-event-header">
                <h2>{formatted.action}</h2>
                <p>
                  <time dateTime={event.created_at}>
                    {new Intl.DateTimeFormat('en', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(event.created_at))}
                  </time>
                  <span aria-hidden="true"> · </span>
                  {formatted.actor}
                </p>
              </header>
              {formatted.changes.length > 0 ? (
                <dl className="recipe-history-changes">
                  {formatted.changes.map((change) => (
                    <div key={change.label}>
                      <dt>{change.label}</dt>
                      <dd>
                        {change.before !== null && (
                          <p>
                            <span>Before:</span> {change.before}
                          </p>
                        )}
                        {change.after !== null && (
                          <p>
                            <span>After:</span> {change.after}
                          </p>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="recipe-history-empty-change">No displayable field changes.</p>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
