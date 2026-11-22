'use client';

import { CookingPot } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import type { RecipeState } from '../../lib/recipes/data';
import {
  formatLocalDateTime,
  isSameLocalCalendarDay,
  nextLocalDayBoundary,
} from '../../lib/recipes/made-rules';
import { ActionFeedback, useRecipeActionFeedback } from '../recipe-action-feedback';
import { markRecipeMade, type RecipeMadeActionState } from './actions';

const initialState: RecipeMadeActionState = { status: 'idle', message: '' };

export function RecipeMadeAction({
  lastMadeAt,
  madeCount,
  reason,
  recipeId,
  state,
  version,
}: {
  lastMadeAt: string | null;
  madeCount: number;
  reason: string | null;
  recipeId: string;
  state: RecipeState;
  version: number;
}) {
  const [actionState, formAction, pending] = useActionState(markRecipeMade, initialState);
  const recipeActionFeedback = useRecipeActionFeedback();
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const savedMadeCount = state === 'want_to_try' ? 0 : madeCount;
  const savedLastMadeAt = state === 'want_to_try' ? null : lastMadeAt;
  const displayedMadeCount =
    actionState.status === 'success' ? actionState.madeCount : savedMadeCount;
  const displayedLastMadeAt =
    actionState.status === 'success' ? actionState.lastMadeAt : savedLastMadeAt;
  const displayedState = actionState.status === 'success' ? 'tried' : state;
  const unavailable = displayedState === 'will_not_try';
  const markedToday =
    !unavailable &&
    timeZone !== null &&
    displayedLastMadeAt !== null &&
    isSameLocalCalendarDay(displayedLastMadeAt, now, timeZone);
  const feedbackKind = pending
    ? 'working'
    : actionState.status === 'idle'
      ? null
      : actionState.status;
  const feedbackMessage = pending ? 'Recording Made…' : actionState.message;
  const label = unavailable
    ? `Made unavailable. State: Will not try. Reason: ${reason || 'No reason recorded'}.`
    : markedToday
      ? `Made ${displayedMadeCount} ${displayedMadeCount === 1 ? 'time' : 'times'}. Already recorded today.`
      : `Record Made. Made ${displayedMadeCount} ${displayedMadeCount === 1 ? 'time' : 'times'}.`;

  useEffect(() => {
    const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimeZone(deviceTimeZone);
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!timeZone) return;
    const boundary = nextLocalDayBoundary(now, timeZone);
    const delay = Math.max(1, boundary.getTime() - Date.now() + 25);
    const timeout = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timeout);
  }, [now, timeZone]);

  useEffect(() => {
    if (!recipeActionFeedback || feedbackKind === null) return;
    recipeActionFeedback.publishFeedback(
      'recipe-made',
      {
        autoDismiss: feedbackKind === 'success',
        dismissOnOutside: false,
        kind: feedbackKind,
        message: feedbackMessage,
      },
      pending,
    );
  }, [feedbackKind, feedbackMessage, pending, recipeActionFeedback]);

  const actionVersion = actionState.status === 'success' ? actionState.version : version;

  return (
    <>
      <form action={formAction} className="recipe-made-action-form">
        <input name="recipe_id" type="hidden" value={recipeId} />
        <input name="expected_version" type="hidden" value={actionVersion} />
        <input name="timezone" type="hidden" value={timeZone ?? ''} />
        <button
          aria-busy={pending}
          aria-describedby={
            feedbackKind
              ? (recipeActionFeedback?.feedbackIds['recipe-made'] ?? 'recipe-made-action-feedback')
              : undefined
          }
          aria-label={label}
          className={`recipe-made-action-trigger${markedToday ? ' is-marked-today' : ''}`}
          data-marked-today={String(markedToday)}
          data-state={unavailable ? 'will-not-try' : markedToday ? 'marked-today' : 'available'}
          disabled={pending || unavailable || markedToday || timeZone === null}
          type="submit"
        >
          <CookingPot
            aria-hidden="true"
            className="recipe-made-pot"
            size={36}
            strokeWidth={4 / 3}
          />
          {markedToday && (
            <svg aria-hidden="true" className="recipe-made-pot-closed-lid" viewBox="0 0 24 24">
              <path d="M3 10h18" />
              <path d="M10 10V8a2 2 0 0 1 4 0v2" />
            </svg>
          )}
          {!unavailable && (
            <span aria-hidden="true" className="recipe-made-count">
              {displayedMadeCount}
            </span>
          )}
          {unavailable && (
            <span aria-hidden="true" className="recipe-made-unavailable-x">
              ✘
            </span>
          )}
        </button>
      </form>
      {displayedState !== 'will_not_try' && displayedMadeCount > 0 && (
        <p className="recipe-made-last-made">
          {displayedLastMadeAt && timeZone ? (
            <>
              Last made:{' '}
              <time dateTime={displayedLastMadeAt}>
                {formatLocalDateTime(displayedLastMadeAt, timeZone)}
              </time>
            </>
          ) : (
            'Last made date unknown.'
          )}
        </p>
      )}
      {feedbackKind && !recipeActionFeedback && (
        <ActionFeedback
          className="recipe-made-action-feedback"
          kind={feedbackKind}
          message={feedbackMessage}
          messageClassName={`recipe-made-action-feedback-${feedbackKind}`}
        />
      )}
    </>
  );
}
