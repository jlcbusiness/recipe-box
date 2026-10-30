'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import { continueInstructionListOnEnter } from '../../lib/recipes/instruction-markdown';
import {
  getIngredientMentionReplacementEnd,
  getInstructionEditorValue,
  type IngredientMentionOption,
  type InstructionStepDraft,
  ingredientMentionMarker,
  ingredientSlug,
  replaceInstructionEditorRange,
  updateInstructionMarkdownFromEditor,
} from '../../lib/recipes/instruction-rules';
import { createUuid } from '../../lib/uuid';
import { FramedMediaImage } from '../media/framed-media-image';
import { useReorderDrag } from './use-reorder-drag';

type InstructionIngredient = {
  id: string;
  name: string;
};

type IngredientSuggestion = InstructionIngredient & {
  kind: 'recipe' | 'catalog';
  mention?: IngredientMentionOption;
};

type InstructionStepsEditorProps = {
  steps: InstructionStepDraft[];
  ingredients: readonly InstructionIngredient[];
  mentionOptions: readonly IngredientMentionOption[];
  availableIngredients: readonly InstructionIngredient[];
  photos: readonly MediaAssetDisplay[];
  onChange: (steps: InstructionStepDraft[]) => void;
  onAddIngredient: (name: string, ingredientId: string | null) => InstructionIngredient;
};

export function InstructionStepsEditor({
  steps,
  ingredients,
  mentionOptions,
  availableIngredients,
  photos,
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
  const [photoPickerStepId, setPhotoPickerStepId] = useState<string | null>(null);
  const [photoPickerRange, setPhotoPickerRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [photoPickerPlacement, setPhotoPickerPlacement] = useState<'above' | 'below'>('below');
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

  useLayoutEffect(() => {
    if (!photoPickerStepId) {
      return;
    }

    const updatePlacement = () => {
      const step = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.recipe-instruction-edit-step[data-instruction-step-id]',
        ),
      ).find((element) => element.dataset.instructionStepId === photoPickerStepId);
      const picker = step?.querySelector<HTMLElement>('.recipe-instruction-photo-picker');
      if (!step || !picker) {
        return;
      }

      const bounds = step.getBoundingClientRect();
      const requiredHeight = Math.min(picker.scrollHeight, window.innerHeight * 0.65);
      const spaceBelow = window.innerHeight - bounds.bottom - 12;
      const spaceAbove = bounds.top - 12;
      setPhotoPickerPlacement(
        spaceBelow < requiredHeight && spaceAbove > spaceBelow ? 'above' : 'below',
      );
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [photoPickerStepId]);

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function updateMarkdown(stepId: string, markdown: string, textarea: HTMLTextAreaElement): string {
    const currentMarkdown = stepsRef.current.find((step) => step.id === stepId)?.markdown ?? '';
    const nextMarkdown = updateInstructionMarkdownFromEditor(
      currentMarkdown,
      markdown,
      photos,
      mentionOptions,
    );
    if (stepId === placeholder.id && nextMarkdown.trim()) {
      const promotedStep = { id: createUuid(), markdown: nextMarkdown, plainText: '' };
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

    onChange(
      steps.map((step) => (step.id === stepId ? { ...step, markdown: nextMarkdown } : step)),
    );
    return stepId;
  }

  function insertPhotoReference(stepId: string, assetId: string) {
    const currentSteps = stepsRef.current;
    const step = currentSteps.find((item) => item.id === stepId);
    const photo = photos.find((item) => item.id === assetId);
    if (!step || !photo || photo.reference_code === null) {
      return;
    }

    const editorValue = getInstructionEditorValue(step.markdown, photos);
    const range = photoPickerStepId === stepId ? photoPickerRange : null;
    const start = range?.start ?? editorValue.length;
    const end = range?.end ?? editorValue.length;
    const markdown = replaceInstructionEditorRange(
      step.markdown,
      start,
      end,
      `[[photo:${assetId}]]`,
    );
    const selectionEnd = start + `+photo${String(photo.reference_code).padStart(2, '0')}`.length;
    pendingFocus.current = { stepId, selectionStart: selectionEnd, selectionEnd };
    onChange(currentSteps.map((item) => (item.id === stepId ? { ...item, markdown } : item)));
    setPhotoPickerStepId(null);
    setPhotoPickerRange(null);
    setAnnouncement('Photo reference added to instruction step.');
  }

  function updatePhotoPicker(stepId: string, textarea: HTMLTextAreaElement) {
    const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const match = /(?<![\p{L}\p{N}_])\+p$/u.exec(beforeCaret);
    if (!match || match.index === undefined) {
      if (photoPickerStepId === stepId) {
        setPhotoPickerStepId(null);
        setPhotoPickerRange(null);
      }
      return;
    }

    setPhotoPickerStepId(stepId);
    setPhotoPickerRange({ start: match.index, end: textarea.selectionStart });
  }

  function cancelPhotoPicker(stepId: string) {
    const range = photoPickerStepId === stepId ? photoPickerRange : null;
    const step = stepsRef.current.find((item) => item.id === stepId);
    if (range && step) {
      const editorValue = getInstructionEditorValue(step.markdown, photos);
      if (editorValue.slice(range.start, range.end) === '+p') {
        const markdown = replaceInstructionEditorRange(
          step.markdown,
          range.start,
          range.end,
          '',
          photos,
        );
        if (newStepIds.current.has(stepId) && !markdown.trim()) {
          newStepIds.current.delete(stepId);
          editingSnapshot.current = null;
          pendingFocus.current = {
            stepId: placeholder.id,
            selectionStart: 0,
            selectionEnd: 0,
          };
          onChange(stepsRef.current.filter((item) => item.id !== stepId));
        } else {
          onChange(
            stepsRef.current.map((item) => (item.id === stepId ? { ...item, markdown } : item)),
          );
          pendingFocus.current = {
            stepId,
            selectionStart: range.start,
            selectionEnd: range.start,
          };
        }
      } else {
        pendingFocus.current = {
          stepId,
          selectionStart: range.start,
          selectionEnd: range.end,
        };
      }
    }
    setPhotoPickerStepId(null);
    setPhotoPickerRange(null);
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
    const marker = candidate.mention
      ? ingredientMentionMarker(candidate.mention)
      : `[[ingredient:${ingredient.id}|${ingredientSlug(ingredient.name)}]]`;
    const currentSteps = stepsRef.current;
    const selectedStep = currentSteps.find((step) => step.id === currentSuggestion.stepId);
    if (!selectedStep) {
      return;
    }

    const editorValue = getInstructionEditorValue(selectedStep.markdown, photos);
    const candidateSlug = candidate.mention?.slug ?? ingredientSlug(candidate.name);
    const replacementEnd = getIngredientMentionReplacementEnd(
      editorValue,
      currentSuggestion.start,
      currentSuggestion.end,
      candidateSlug,
    );

    const markdown = replaceInstructionEditorRange(
      selectedStep.markdown,
      currentSuggestion.start,
      replacementEnd,
      marker,
      photos,
    );
    const selectionStart = currentSuggestion.start + `#${candidateSlug}`.length;
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
        ...mentionOptions
          .filter((option) => option.slug.includes(suggestion.query.toLocaleLowerCase()))
          .map((option) => ({
            id: `${option.recipeIngredientId}:${option.portionOrdinal ?? 'whole'}`,
            name: option.label,
            kind: 'recipe' as const,
            mention: option,
          })),
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

    const newStep = { id: createUuid(), markdown: '', plainText: '' };
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
                value={getInstructionEditorValue(step.markdown, photos)}
                onChange={(event) => {
                  const updatedStepId = updateMarkdown(
                    step.id,
                    event.currentTarget.value,
                    event.currentTarget,
                  );
                  resizeTextarea(event.currentTarget);
                  updateSuggestion(updatedStepId, event.currentTarget);
                  updatePhotoPicker(updatedStepId, event.currentTarget);
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
                  } else if (photoPickerStepId === step.id && event.key === 'Escape') {
                    event.preventDefault();
                    cancelPhotoPicker(step.id);
                  } else if (event.ctrlKey && event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveStep(step.id, -1);
                  } else if (event.ctrlKey && event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveStep(step.id, 1);
                  } else if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    const textarea = event.currentTarget;
                    const listContinuation = continueInstructionListOnEnter(
                      textarea.value,
                      textarea.selectionStart,
                      textarea.selectionEnd,
                    );
                    if (listContinuation) {
                      const updatedStepId = updateMarkdown(
                        step.id,
                        listContinuation.markdown,
                        textarea,
                      );
                      pendingFocus.current = {
                        stepId: updatedStepId,
                        selectionStart: listContinuation.caret,
                        selectionEnd: listContinuation.caret,
                      };
                      setSuggestion(null);
                    } else if (!isPlaceholder) {
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
              {photoPickerStepId === step.id && (
                <fieldset
                  className="recipe-instruction-photo-picker"
                  data-placement={photoPickerPlacement}
                >
                  <legend className="visually-hidden">
                    Choose a photo for instruction step {index + 1}
                  </legend>
                  {photos.map((photo) => (
                    <button
                      aria-label={`Insert photo ${String(photo.reference_code ?? 0).padStart(2, '0')}`}
                      className="recipe-instruction-photo-choice"
                      key={photo.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelPhotoPicker(step.id);
                        }
                      }}
                      onClick={() => insertPhotoReference(step.id, photo.id)}
                      type="button"
                    >
                      <span className="recipe-instruction-photo-choice-image">
                        <FramedMediaImage
                          alt=""
                          className="recipe-instruction-photo-choice-img"
                          crop={photo.crop}
                          displayHeight={photo.display_height}
                          displayWidth={photo.display_width}
                          height={photo.height}
                          src={photo.thumbnail_url}
                          width={photo.width}
                        />
                        <span aria-hidden="true" className="recipe-instruction-photo-code">
                          {String(photo.reference_code ?? 0).padStart(2, '0')}
                        </span>
                      </span>
                      <span>Photo {String(photo.reference_code ?? 0).padStart(2, '0')}</span>
                    </button>
                  ))}
                </fieldset>
              )}
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
