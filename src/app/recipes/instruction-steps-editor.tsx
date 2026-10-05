'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { type InstructionStepDraft, ingredientSlug } from '../../lib/recipes/instruction-rules';
import { useReorderDrag } from './use-reorder-drag';

type InstructionIngredient = {
  id: string;
  name: string;
};

type IngredientSuggestion = InstructionIngredient & {
  kind: 'recipe' | 'catalog';
};

type InstructionStepsEditorProps = {
  steps: InstructionStepDraft[];
  ingredients: readonly InstructionIngredient[];
  availableIngredients: readonly InstructionIngredient[];
  onChange: (steps: InstructionStepDraft[]) => void;
  onAddIngredient: (name: string, ingredientId: string | null) => InstructionIngredient;
};

export function InstructionStepsEditor({
  steps,
  ingredients,
  availableIngredients,
  onChange,
  onAddIngredient,
}: InstructionStepsEditorProps) {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const newStepIds = useRef(new Set<string>());
  const editingSnapshot = useRef<{
    stepId: string;
    markdown: string;
    isNew: boolean;
  } | null>(null);
  const pendingFocus = useRef<{
    stepId: string;
    selectionStart: number;
    selectionEnd: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const pendingDrop = useRef<{ sourceId: string; stepTops: Map<string, number> } | null>(null);
  const reorderDrag = useReorderDrag();
  const dragPreview = reorderDrag.preview;
  const [suggestion, setSuggestion] = useState<{
    stepId: string;
    start: number;
    end: number;
    query: string;
    activeIndex: number;
  } | null>(null);
  const placeholder = { id: 'instruction-draft', markdown: '', plainText: '' };
  const editableSteps = steps.filter((step) => step.id !== placeholder.id);
  const visibleSteps = [...editableSteps, placeholder];

  useLayoutEffect(() => {
    if (dragPreview) {
      return;
    }
    const pending = pendingDrop.current;
    if (!pending) {
      return;
    }
    pendingDrop.current = null;

    const editor = document.querySelector('.recipe-instruction-editor');
    const offsets = new Map<string, number>();
    for (const step of Array.from(
      editor?.querySelectorAll<HTMLElement>(
        '.recipe-instruction-edit-step[data-instruction-step-id]',
      ) ?? [],
    )) {
      const stepId = step.dataset.instructionStepId;
      const startingTop = stepId ? pending.stepTops.get(stepId) : undefined;
      if (stepId && startingTop !== undefined && step.getBoundingClientRect().height > 0) {
        offsets.set(stepId, startingTop - step.getBoundingClientRect().top);
      }
    }
    if (!offsets.size) {
      setDropCommitPending(false);
      return;
    }

    setDropOffsets(offsets);
    setDropCommitPending(false);
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettlingSourceId(
      canAnimate && Math.abs(offsets.get(pending.sourceId) ?? 0) > 0.5 ? pending.sourceId : null,
    );
    window.requestAnimationFrame(() => setDropOffsets(new Map()));
  }, [dragPreview]);

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function updateMarkdown(stepId: string, markdown: string, textarea: HTMLTextAreaElement): string {
    if (stepId === placeholder.id && markdown.trim()) {
      const promotedStep = { id: crypto.randomUUID(), markdown, plainText: '' };
      newStepIds.current.add(promotedStep.id);
      pendingFocus.current = {
        stepId: promotedStep.id,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      };
      onChange([...editableSteps, promotedStep, placeholder]);
      return promotedStep.id;
    }

    if (stepId === placeholder.id) {
      return stepId;
    }

    onChange(steps.map((step) => (step.id === stepId ? { ...step, markdown } : step)));
    return stepId;
  }

  function updateSuggestion(stepId: string, textarea: HTMLTextAreaElement) {
    const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const match = /(?:^|\s)#([\p{L}\p{N}-]*)$/u.exec(beforeCaret);
    if (!match || match.index === undefined) {
      setSuggestion(null);
      return;
    }

    const afterCaret = textarea.value.slice(textarea.selectionStart);
    const trailingWord = /^[\p{L}\p{N}-]*/u.exec(afterCaret)?.[0] ?? '';
    const query = `${match[1] ?? ''}${trailingWord}`;
    const start = match.index + match[0].lastIndexOf('#');
    setSuggestion({
      stepId,
      start,
      end: textarea.selectionStart + trailingWord.length,
      query,
      activeIndex: 0,
    });
  }

  function selectSuggestion(
    candidate: IngredientSuggestion,
    currentSuggestion: NonNullable<typeof suggestion>,
  ) {
    const ingredient =
      candidate.kind === 'catalog' ? onAddIngredient(candidate.name, candidate.id) : candidate;
    const marker = `[[ingredient:${ingredient.id}|${ingredientSlug(ingredient.name)}]]`;
    const currentSteps = stepsRef.current;
    const selectedStep = currentSteps.find((step) => step.id === currentSuggestion.stepId);
    if (!selectedStep) {
      return;
    }

    const markdown = `${selectedStep.markdown.slice(0, currentSuggestion.start)}${marker}${selectedStep.markdown.slice(currentSuggestion.end)}`;
    const selectionStart = currentSuggestion.start + marker.length;
    pendingFocus.current = {
      stepId: currentSuggestion.stepId,
      selectionStart,
      selectionEnd: selectionStart,
    };
    onChange(
      currentSteps.map((step) =>
        step.id === currentSuggestion.stepId ? { ...step, markdown } : step,
      ),
    );
    setSuggestion(null);
    setAnnouncement(`Linked ${ingredient.name}.`);
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    const sourceIndex = editableSteps.findIndex((step) => step.id === stepId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= editableSteps.length) {
      return;
    }

    const reordered = [...editableSteps];
    [reordered[sourceIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[sourceIndex],
    ];
    onChange([...reordered, placeholder]);
    setAnnouncement(`Instruction step moved to position ${targetIndex + 1}.`);
  }

  const matchingIngredients: IngredientSuggestion[] = suggestion
    ? [
        ...ingredients
          .filter((ingredient) =>
            ingredientSlug(ingredient.name).includes(suggestion.query.toLocaleLowerCase()),
          )
          .map((ingredient) => ({ ...ingredient, kind: 'recipe' as const })),
        ...(suggestion.query
          ? availableIngredients
              .filter(
                (ingredient) =>
                  ingredientSlug(ingredient.name).includes(suggestion.query.toLocaleLowerCase()) &&
                  !ingredients.some(
                    (recipeIngredient) =>
                      ingredientSlug(recipeIngredient.name) === ingredientSlug(ingredient.name),
                  ),
              )
              .map((ingredient) => ({ ...ingredient, kind: 'catalog' as const }))
          : []),
      ]
    : [];
  const matchingSlug = suggestion
    ? matchingIngredients.some(
        (ingredient) => ingredientSlug(ingredient.name) === suggestion.query.toLocaleLowerCase(),
      )
    : false;
  const canCreateIngredient = Boolean(suggestion?.query) && !matchingSlug;
  const suggestionCount = matchingIngredients.length + Number(canCreateIngredient);

  function insertStepAfter(stepId: string) {
    const sourceIndex = editableSteps.findIndex((step) => step.id === stepId);
    if (sourceIndex < 0) {
      return;
    }

    const newStep = { id: crypto.randomUUID(), markdown: '', plainText: '' };
    newStepIds.current.add(newStep.id);
    const nextSteps = [...editableSteps];
    nextSteps.splice(sourceIndex + 1, 0, newStep);
    pendingFocus.current = { stepId: newStep.id, selectionStart: 0, selectionEnd: 0 };
    onChange([...nextSteps, placeholder]);
    setAnnouncement(`New instruction step ${sourceIndex + 2}.`);
  }

  function moveDraggedStep(sourceStepId: string, targetStepId: string) {
    if (!sourceStepId || sourceStepId === targetStepId) {
      return;
    }

    const sourceIndex = editableSteps.findIndex((step) => step.id === sourceStepId);
    const targetIndex =
      targetStepId === placeholder.id
        ? editableSteps.length
        : editableSteps.findIndex((step) => step.id === targetStepId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const reordered = [...editableSteps];
    const [movedStep] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedStep);
    onChange([...reordered, placeholder]);
    setAnnouncement(`Instruction step moved to position ${targetIndex + 1}.`);
  }

  return (
    <div className="recipe-instruction-editor">
      <ol className="recipe-instruction-edit-list">
        {visibleSteps.map((step, index) => {
          const isPlaceholder = step.id === placeholder.id;
          const sourceIndex = dragPreview
            ? visibleSteps.findIndex((item) => item.id === dragPreview.sourceId)
            : -1;
          const targetIndex = dragPreview
            ? visibleSteps.findIndex((item) => item.id === dragPreview.targetId)
            : -1;
          const reorderState =
            dragPreview?.sourceId === step.id
              ? 'dragging'
              : dragPreview &&
                  ((sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) ||
                    (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex))
                ? 'displaced'
                : settlingSourceId === step.id
                  ? 'settling'
                  : undefined;
          const transform =
            dragPreview && reorderState === 'dragging'
              ? `translateY(${dragPreview.pointerOffset}px)`
              : dragPreview && reorderState === 'displaced'
                ? `translateY(${sourceIndex < targetIndex ? -dragPreview.offset : dragPreview.offset}px)`
                : dropOffsets.has(step.id)
                  ? `translateY(${dropOffsets.get(step.id)}px)`
                  : undefined;
          return (
            <li
              className={`recipe-instruction-edit-step${isPlaceholder ? ' is-empty' : ''}`}
              data-instruction-step-id={step.id}
              data-reorder-state={reorderState}
              style={{
                transform,
                transition: dropCommitPending || dropOffsets.has(step.id) ? 'none' : undefined,
              }}
              key={step.id}
              onTransitionEnd={(event) => {
                if (event.propertyName === 'transform' && settlingSourceId === step.id) {
                  setSettlingSourceId(null);
                }
              }}
            >
              {isPlaceholder ? (
                <>
                  <span aria-hidden="true" className="recipe-instruction-step-number-spacer" />
                  <span aria-hidden="true" className="recipe-instruction-drag-spacer" />
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="recipe-instruction-step-number">
                    {index + 1}
                  </span>
                  <button
                    aria-label={`Reorder instruction step ${index + 1}`}
                    className="recipe-instruction-drag-handle"
                    title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
                    type="button"
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }
                      const rowElements = event.currentTarget
                        .closest('.recipe-instruction-editor')
                        ?.querySelectorAll<HTMLElement>('.recipe-instruction-edit-step');
                      const rowBounds = Array.from(rowElements ?? []).flatMap((rowElement) => {
                        const stepId = rowElement.dataset.instructionStepId;
                        if (!stepId || stepId === placeholder.id) {
                          return [];
                        }
                        const bounds = rowElement.getBoundingClientRect();
                        return [
                          {
                            id: stepId,
                            top: bounds.top + window.scrollY,
                            bottom: bounds.bottom + window.scrollY,
                          },
                        ];
                      });
                      const sourceElement = event.currentTarget.closest<HTMLElement>(
                        '.recipe-instruction-edit-step',
                      );
                      reorderDrag.start(
                        step.id,
                        event.clientY,
                        sourceElement?.getBoundingClientRect().height ?? 48,
                        rowBounds,
                      );
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => reorderDrag.move(event.clientY)}
                    onPointerUp={(event) => {
                      const hitTargetStepId = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>('[data-instruction-step-id]')
                        ?.dataset.instructionStepId;
                      const draggedStep = reorderDrag.finish(
                        hitTargetStepId === placeholder.id ? undefined : hitTargetStepId,
                      );
                      if (draggedStep) {
                        if (draggedStep.sourceId !== draggedStep.targetId) {
                          const instructionRows = Array.from(
                            event.currentTarget
                              .closest('.recipe-instruction-editor')
                              ?.querySelectorAll<HTMLElement>(
                                '.recipe-instruction-edit-step[data-instruction-step-id]',
                              ) ?? [],
                          ).filter((row) => row.getBoundingClientRect().height > 0);
                          pendingDrop.current = {
                            sourceId: draggedStep.sourceId,
                            stepTops: new Map(
                              instructionRows.flatMap((row) => {
                                const stepId = row.dataset.instructionStepId;
                                return stepId && stepId !== placeholder.id
                                  ? [[stepId, row.getBoundingClientRect().top] as const]
                                  : [];
                              }),
                            ),
                          };
                          setDropCommitPending(true);
                          moveDraggedStep(draggedStep.sourceId, draggedStep.targetId);
                        }
                      }
                    }}
                    onPointerCancel={(event) => {
                      reorderDrag.cancel();
                      event.currentTarget.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && reorderDrag.preview) {
                        event.preventDefault();
                        reorderDrag.cancel();
                        event.currentTarget.focus();
                      }
                    }}
                  >
                    <span aria-hidden="true" className="recipe-instruction-grip" />
                  </button>
                </>
              )}
              <textarea
                aria-label={`Instruction step ${index + 1}`}
                className="recipe-instruction-textarea"
                placeholder={isPlaceholder ? 'Add instruction…' : undefined}
                rows={1}
                onFocus={() => {
                  if (isPlaceholder) {
                    editingSnapshot.current = null;
                    return;
                  }

                  const isNew = newStepIds.current.has(step.id);
                  editingSnapshot.current = {
                    stepId: step.id,
                    markdown: isNew ? '' : step.markdown,
                    isNew,
                  };
                }}
                value={step.markdown}
                onChange={(event) => {
                  const updatedStepId = updateMarkdown(
                    step.id,
                    event.currentTarget.value,
                    event.currentTarget,
                  );
                  resizeTextarea(event.currentTarget);
                  updateSuggestion(updatedStepId, event.currentTarget);
                }}
                onKeyDown={(event) => {
                  const isSuggestionOpen = suggestion?.stepId === step.id && suggestionCount > 0;
                  if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '.') {
                    event.preventDefault();
                    const textarea = event.currentTarget;
                    const selectionStart = textarea.selectionStart;
                    const selectionEnd = textarea.selectionEnd;
                    const markdown = `${textarea.value.slice(0, selectionStart)}°${textarea.value.slice(selectionEnd)}`;
                    const updatedStepId = updateMarkdown(step.id, markdown, textarea);
                    pendingFocus.current = {
                      stepId: updatedStepId,
                      selectionStart: selectionStart + 1,
                      selectionEnd: selectionStart + 1,
                    };
                    setSuggestion(null);
                  } else if (isSuggestionOpen && event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSuggestion((current) =>
                      current
                        ? { ...current, activeIndex: (current.activeIndex + 1) % suggestionCount }
                        : null,
                    );
                  } else if (isSuggestionOpen && event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSuggestion((current) =>
                      current
                        ? {
                            ...current,
                            activeIndex:
                              (current.activeIndex - 1 + suggestionCount) % suggestionCount,
                          }
                        : null,
                    );
                  } else if (isSuggestionOpen && event.key === 'Enter') {
                    event.preventDefault();
                    const activeIngredient = matchingIngredients[suggestion.activeIndex];
                    if (activeIngredient) {
                      selectSuggestion(activeIngredient, suggestion);
                    } else if (canCreateIngredient) {
                      selectSuggestion(
                        {
                          ...onAddIngredient(suggestion.query.replaceAll('-', ' '), null),
                          kind: 'recipe',
                        },
                        suggestion,
                      );
                    }
                  } else if (isSuggestionOpen && event.key === 'Escape') {
                    event.preventDefault();
                    setSuggestion(null);
                  } else if (event.ctrlKey && event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveStep(step.id, -1);
                  } else if (event.ctrlKey && event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveStep(step.id, 1);
                  } else if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!isPlaceholder) {
                      insertStepAfter(step.id);
                    }
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    const snapshot = editingSnapshot.current;
                    if (isPlaceholder || snapshot?.stepId !== step.id) {
                      return;
                    }

                    if (snapshot.isNew) {
                      newStepIds.current.delete(step.id);
                      editingSnapshot.current = null;
                      pendingFocus.current = {
                        stepId: placeholder.id,
                        selectionStart: 0,
                        selectionEnd: 0,
                      };
                      onChange([
                        ...editableSteps.filter((item) => item.id !== step.id),
                        placeholder,
                      ]);
                      setAnnouncement(`Cancelled instruction step ${index + 1}.`);
                    } else {
                      onChange(
                        steps.map((item) =>
                          item.id === step.id ? { ...item, markdown: snapshot.markdown } : item,
                        ),
                      );
                      setAnnouncement(`Reverted instruction step ${index + 1}.`);
                    }
                  }
                }}
                ref={(element) => {
                  if (element) {
                    resizeTextarea(element);
                    const focusTarget = pendingFocus.current;
                    if (focusTarget?.stepId === step.id) {
                      element.focus();
                      element.setSelectionRange(
                        focusTarget.selectionStart,
                        focusTarget.selectionEnd,
                      );
                      pendingFocus.current = null;
                    }
                  }
                }}
              />
              {suggestion?.stepId === step.id && suggestionCount > 0 && (
                <div
                  aria-label="Ingredient suggestions"
                  aria-live="polite"
                  className="recipe-instruction-suggestions"
                  role="listbox"
                >
                  {matchingIngredients.map((ingredient, suggestionIndex) => (
                    <button
                      aria-selected={suggestion.activeIndex === suggestionIndex}
                      className="recipe-instruction-suggestion"
                      key={ingredient.id}
                      role="option"
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(ingredient, suggestion)}
                    >
                      {ingredient.name}
                    </button>
                  ))}
                  {canCreateIngredient && (
                    <button
                      aria-selected={suggestion.activeIndex === matchingIngredients.length}
                      className="recipe-instruction-suggestion"
                      role="option"
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        selectSuggestion(
                          {
                            ...onAddIngredient(suggestion.query.replaceAll('-', ' '), null),
                            kind: 'recipe',
                          },
                          suggestion,
                        )
                      }
                    >
                      Create ingredient “{suggestion.query.replaceAll('-', ' ')}”
                    </button>
                  )}
                </div>
              )}
              {!isPlaceholder && (
                <button
                  aria-label={`Remove instruction step ${index + 1}`}
                  className="recipe-instruction-delete-button"
                  title="Remove instruction step"
                  type="button"
                  onClick={() => {
                    newStepIds.current.delete(step.id);
                    onChange([...editableSteps.filter((item) => item.id !== step.id), placeholder]);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <span aria-live="polite" className="visually-hidden">
        {announcement}
      </span>
    </div>
  );
}
