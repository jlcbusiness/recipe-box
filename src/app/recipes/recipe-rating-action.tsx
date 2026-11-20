'use client';

import { Hand, ThumbsDown, ThumbsUp } from 'lucide-react';
import { type KeyboardEvent, useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  type RecipeScore,
  recipeScoreLabels,
  recipeScoreValues,
} from '../../lib/recipes/recipe-rules';
import { ActionFeedback, useRecipeActionFeedback } from '../recipe-action-feedback';
import { type RecipeRatingActionState, setRecipeRating } from './actions';

const initialState: RecipeRatingActionState = { status: 'idle', message: '' };
const ratingOptions = [...recipeScoreValues].reverse().map((score) => ({
  score,
  label: recipeScoreLabels[score],
}));

function getRatingGesture(score: RecipeScore | null) {
  if (score === null) return 'clear';
  if (score === 0) return 'palm-down';
  return score > 0 ? 'thumbs-up' : 'thumbs-down';
}

function getRatingTone(score: RecipeScore | null) {
  if (score === null || score === 0) return 'neutral';
  return score > 0 ? 'positive' : 'negative';
}

function RatingHandArt({ score }: { score: RecipeScore | null }) {
  const tone = getRatingTone(score);
  const gesture = getRatingGesture(score);
  if (gesture === 'palm-down') {
    return (
      <svg
        aria-hidden="true"
        className="recipe-rating-hand"
        data-gesture={gesture}
        data-tone={tone}
        fill="none"
        height={36}
        viewBox="0 0 24 24"
        width={36}
      >
        <path
          className="recipe-rating-hand-fill"
          d="M6 14V6Q6 4 8 4Q10 4 10 6V4Q10 2 12 2Q14 2 14 4V6Q14 4 16 4Q18 4 18 6V8Q18 6 20 6Q22 6 22 8V14a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15V14Z"
        />
        <Hand
          aria-hidden="true"
          className="recipe-rating-hand-contour"
          fill="none"
          size={24}
          stroke="currentColor"
          strokeWidth={4 / 3}
        />
      </svg>
    );
  }

  const Icon = gesture === 'thumbs-up' || gesture === 'clear' ? ThumbsUp : ThumbsDown;

  return (
    <Icon
      aria-hidden="true"
      className="recipe-rating-hand"
      data-gesture={gesture}
      data-tone={tone}
      fill="none"
      size={36}
      strokeWidth={4 / 3}
    />
  );
}

export function RecipeRatingAction({
  recipeId,
  score,
  version,
}: {
  recipeId: string;
  score: RecipeScore | null;
  version: number;
}) {
  const [actionState, formAction, pending] = useActionState(setRecipeRating, initialState);
  const recipeActionFeedback = useRecipeActionFeedback();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(
      0,
      ratingOptions.findIndex((option) => option.score === score),
    ),
  );
  const menuId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const feedbackKind = pending
    ? 'working'
    : actionState.status === 'idle'
      ? null
      : actionState.status;
  const feedbackMessage = pending ? 'Saving Rating…' : actionState.message;

  useEffect(() => {
    if (!recipeActionFeedback || feedbackKind === null) return;
    recipeActionFeedback.publishFeedback(
      'recipe-rating',
      {
        autoDismiss: feedbackKind === 'success',
        dismissOnOutside: false,
        kind: feedbackKind,
        message: feedbackMessage,
      },
      pending,
    );
  }, [feedbackKind, feedbackMessage, pending, recipeActionFeedback]);

  useEffect(() => {
    if (isOpen) {
      optionRefs.current[activeIndex]?.focus();
    }
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!pending && actionState.status !== 'idle') {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }, [actionState.status, pending]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !formRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  function openMenu() {
    if (pending) return;
    setActiveIndex(
      Math.max(
        0,
        ratingOptions.findIndex((option) => option.score === score),
      ),
    );
    setIsOpen(true);
  }

  function closeMenuAndFocusTrigger() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenuAndFocusTrigger();
      return;
    }

    const menuItemCount = ratingOptions.length + 1;
    let nextIndex = activeIndex;
    if (event.key === 'ArrowDown') nextIndex = (activeIndex + 1) % menuItemCount;
    else if (event.key === 'ArrowUp') {
      nextIndex = (activeIndex - 1 + menuItemCount) % menuItemCount;
    } else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = menuItemCount - 1;
    else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  const accessibleName =
    score === null ? 'Rating: Unrated' : `Rating: ${score}, ${recipeScoreLabels[score]}`;

  return (
    <>
      <form action={formAction} className="recipe-rating-action-form" ref={formRef}>
        <input name="recipe_id" type="hidden" value={recipeId} />
        <input name="expected_version" type="hidden" value={version} />
        <button
          aria-busy={pending}
          aria-controls={isOpen ? menuId : undefined}
          aria-describedby={
            feedbackKind
              ? (recipeActionFeedback?.feedbackIds['recipe-rating'] ?? `${menuId}-rating-feedback`)
              : undefined
          }
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={accessibleName}
          className="recipe-rating-action-trigger"
          disabled={pending}
          onClick={() => (isOpen ? closeMenuAndFocusTrigger() : openMenu())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              openMenu();
            }
          }}
          ref={triggerRef}
          type="button"
        >
          <RatingHandArt score={score} />
          {score !== null ? (
            <span
              className="recipe-rating-palm"
              data-gesture={getRatingGesture(score)}
              data-tone={getRatingTone(score)}
            >
              <span className="recipe-rating-number">{score}</span>
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="recipe-rating-palm"
              data-gesture="clear"
              data-tone="neutral"
            >
              <span className="recipe-rating-question">?</span>
            </span>
          )}
        </button>
        {isOpen && (
          <div
            aria-label="Rating choices"
            className="recipe-rating-menu"
            id={menuId}
            onKeyDown={handleMenuKeyDown}
            role="menu"
          >
            {ratingOptions.map(({ score: optionScore, label }, index) => (
              <button
                aria-checked={score === optionScore}
                aria-label={`${optionScore}, ${label}`}
                className="recipe-rating-choice"
                data-tone={getRatingTone(optionScore)}
                disabled={pending}
                key={optionScore}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="menuitemradio"
                tabIndex={activeIndex === index ? 0 : -1}
                name="score"
                type="submit"
                value={optionScore}
              >
                <span className="recipe-rating-choice-value">{optionScore}</span>
                <span className="recipe-rating-choice-label">{label}</span>
                <span aria-hidden="true" className="recipe-rating-choice-check">
                  {score === optionScore ? '✓' : ''}
                </span>
              </button>
            ))}
            <button
              className="recipe-rating-clear"
              disabled={pending}
              name="score"
              ref={(element) => {
                optionRefs.current[ratingOptions.length] = element;
              }}
              role="menuitem"
              tabIndex={activeIndex === ratingOptions.length ? 0 : -1}
              type="submit"
              value=""
            >
              <span className="recipe-rating-clear-label">Clear</span>
            </button>
          </div>
        )}
      </form>
      {!recipeActionFeedback && feedbackKind && (
        <ActionFeedback
          className="export-action-feedback recipe-output-feedback"
          id={`${menuId}-rating-feedback`}
          kind={feedbackKind}
          message={feedbackMessage}
          messageClassName={`export-action-feedback-${feedbackKind}`}
        />
      )}
    </>
  );
}
