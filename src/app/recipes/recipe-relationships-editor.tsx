'use client';

import { X } from 'lucide-react';
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { RecipePairing, RecipeReference } from '../../lib/recipes/data';
import { ingredientSlug as slugify } from '../../lib/recipes/instruction-rules';

type RecipeLinkOption = { id: string; name: string };
type ReferenceType = RecipeReference['reference_type'];
type EditableReferenceType = Exclude<ReferenceType, 'publication'>;

const referenceTypeOptions: { value: EditableReferenceType; label: string }[] = [
  { value: 'recipe', label: 'Recipe' },
  { value: 'external_url', label: 'Url' },
  { value: 'printed_citation', label: 'Print' },
];
const longestReferenceTypeLabel = referenceTypeOptions.reduce(
  (longest, option) => (option.label.length > longest.length ? option.label : longest),
  '',
);

type PairingDraft = {
  id: string;
  display_text: string;
  linked_recipe_id: string | null;
};

type ReferenceDraft = {
  id: string;
  reference_type: ReferenceType;
  display_text: string;
  linked_recipe_id: string | null;
  publication_id: string | null;
  url: string | null;
};

type SerializedReference = {
  id: string;
  reference_type: ReferenceType;
  display_text: string;
  linked_recipe_id: string | null;
  publication_id: string | null;
  url: string | null;
};

type RecipeRelationshipsEditorProps = {
  recipeOptions: RecipeLinkOption[];
  pairings: RecipePairing[];
  references: RecipeReference[];
  children: ReactNode;
};

function ReferenceTypePicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: EditableReferenceType;
  onChange: (value: EditableReferenceType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    referenceTypeOptions.findIndex((option) => option.value === value),
  );
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLFieldSetElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.getElementById(`${id}-option-${activeIndex}`)?.focus();
    }
  }, [activeIndex, id, isOpen]);

  function openMenu() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const bounds = trigger.getBoundingClientRect();
    const menuHeight = referenceTypeOptions.length * 36 + 8;
    const openAbove = window.innerHeight - bounds.bottom < menuHeight && bounds.top > menuHeight;
    const width = Math.min(Math.max(bounds.width, 160), window.innerWidth - 32);
    const left = Math.min(Math.max(bounds.left, 16), window.innerWidth - width - 16);
    const top = openAbove
      ? Math.max(8, bounds.top - menuHeight - 4)
      : Math.min(bounds.bottom + 4, window.innerHeight - menuHeight - 8);

    setMenuPosition({ position: 'fixed', left, top, width, maxHeight: 'calc(100dvh - 16px)' });
    setActiveIndex(
      Math.max(
        0,
        referenceTypeOptions.findIndex((option) => option.value === value),
      ),
    );
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLFieldSetElement>) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      setIsOpen(false);
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index + delta + referenceTypeOptions.length) % referenceTypeOptions.length);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  const selectedOption = referenceTypeOptions.find((option) => option.value === value);

  return (
    <fieldset
      aria-label={label}
      className="recipe-reference-type-control"
      ref={wrapperRef}
      onBlur={handleBlur}
    >
      <button
        aria-controls={`${id}-options`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        className="recipe-reference-type-trigger"
        id={id}
        ref={triggerRef}
        role="combobox"
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="recipe-reference-type-label">
          <span aria-hidden="true" className="recipe-reference-type-measure">
            {longestReferenceTypeLabel}
          </span>
          <span>{selectedOption?.label}</span>
        </span>
        <span aria-hidden="true" className="recipe-picklist-arrow">
          ▾
        </span>
      </button>
      {isOpen && (
        <div
          aria-label={label}
          className="recipe-reference-type-menu"
          id={`${id}-options`}
          role="listbox"
          style={menuPosition}
        >
          {referenceTypeOptions.map((option, index) => (
            <button
              aria-selected={index === activeIndex}
              className="recipe-reference-type-option"
              id={`${id}-option-${index}`}
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function createPairing(): PairingDraft {
  return { id: crypto.randomUUID(), display_text: '', linked_recipe_id: null };
}

function createReference(): ReferenceDraft {
  return {
    id: crypto.randomUUID(),
    reference_type: 'recipe',
    display_text: '',
    linked_recipe_id: null,
    publication_id: null,
    url: null,
  };
}

export function RecipeRelationshipsEditor({
  recipeOptions,
  pairings: initialPairings,
  references: initialReferences,
  children,
}: RecipeRelationshipsEditorProps) {
  const pairingRowsRef = useRef<HTMLDivElement>(null);
  const [pairings, setPairings] = useState<PairingDraft[]>(() =>
    initialPairings.map(({ id, display_text, linked_recipe_id }) => ({
      id,
      display_text,
      linked_recipe_id,
    })),
  );
  const [references, setReferences] = useState<ReferenceDraft[]>(() =>
    initialReferences.map(
      ({ id, reference_type, display_text, linked_recipe_id, publication_id, url }) => ({
        id,
        reference_type,
        display_text,
        linked_recipe_id,
        publication_id,
        url,
      }),
    ),
  );
  const [activeSuggestion, setActiveSuggestion] = useState<{
    pairingId: string;
    query: string;
    index: number;
  } | null>(null);
  const [activeReferenceSuggestion, setActiveReferenceSuggestion] = useState<{
    referenceId: string;
    query: string;
    index: number;
  } | null>(null);

  useEffect(() => {
    const pairingRows = pairingRowsRef.current;
    const restTimeInput = document.getElementById('rest_time_minutes');
    const pairingEditor = pairingRows?.closest<HTMLElement>('.recipe-relationship-editor');
    if (!pairingRows || !restTimeInput || !pairingEditor) {
      return;
    }

    const updatePairingMaxWidth = () => {
      const width =
        restTimeInput.getBoundingClientRect().right - pairingRows.getBoundingClientRect().left;
      if (width > 0) {
        pairingEditor.style.setProperty('--pairing-field-max-width', `${width}px`);
      }
    };

    const resizeObserver = new ResizeObserver(updatePairingMaxWidth);
    const timeFields = restTimeInput.closest('.recipe-time-fields');
    if (timeFields) {
      resizeObserver.observe(timeFields);
    }
    resizeObserver.observe(pairingRows);
    window.addEventListener('resize', updatePairingMaxWidth);
    updatePairingMaxWidth();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePairingMaxWidth);
    };
  }, []);

  const serializedReferences: SerializedReference[] = [];
  for (const reference of references) {
    if (reference.reference_type === 'publication' && reference.display_text.trim()) {
      serializedReferences.push(reference);
    } else if (reference.reference_type === 'recipe' && reference.display_text.trim()) {
      serializedReferences.push({ ...reference, publication_id: null, url: null });
    } else if (reference.reference_type === 'external_url' && reference.url?.trim()) {
      serializedReferences.push({
        ...reference,
        display_text: reference.url.trim(),
        publication_id: null,
      });
    } else if (reference.reference_type === 'printed_citation' && reference.display_text.trim()) {
      serializedReferences.push({ ...reference, publication_id: null, url: null });
    }
  }

  const relationshipPayload = {
    site_listing: null,
    pairings: pairings
      .filter(({ display_text }) => display_text.trim())
      .map(({ id, display_text, linked_recipe_id }) => ({ id, display_text, linked_recipe_id })),
    references: serializedReferences,
  };

  function matchingPairingRecipes(value: string) {
    const match = /#([\p{L}\p{N}-]*)$/u.exec(value);
    if (!match) {
      return [];
    }
    const query = match[1]?.toLocaleLowerCase() ?? '';
    return recipeOptions.filter((recipe) => slugify(recipe.name).includes(query));
  }

  function matchingReferenceRecipes(query: string) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return recipeOptions
      .filter((recipe) => recipe.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }

  function choosePairingRecipe(pairingId: string, recipe: RecipeLinkOption) {
    setPairings((current) =>
      current.map((pairing) =>
        pairing.id === pairingId
          ? { ...pairing, display_text: recipe.name, linked_recipe_id: recipe.id }
          : pairing,
      ),
    );
    setActiveSuggestion(null);
  }

  function chooseReferenceRecipe(referenceId: string, recipe: RecipeLinkOption) {
    setReferences((current) =>
      current.map((reference) =>
        reference.id === referenceId
          ? { ...reference, display_text: recipe.name, linked_recipe_id: recipe.id }
          : reference,
      ),
    );
    setActiveReferenceSuggestion(null);
  }

  function handlePairingKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    pairingId: string,
    suggestions: RecipeLinkOption[],
  ) {
    if (!suggestions.length || activeSuggestion?.pairingId !== pairingId) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveSuggestion((current) => ({
        pairingId,
        query: current?.query ?? '',
        index: (Math.max(current?.index ?? 0, 0) + delta + suggestions.length) % suggestions.length,
      }));
    } else if (event.key === 'Enter') {
      const recipe = suggestions[activeSuggestion.index];
      if (recipe) {
        event.preventDefault();
        choosePairingRecipe(pairingId, recipe);
      }
    } else if (event.key === 'Escape') {
      setActiveSuggestion(null);
    }
  }

  function handleReferenceRecipeKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    referenceId: string,
    suggestions: RecipeLinkOption[],
  ) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) {
        return;
      }
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveReferenceSuggestion((current) => ({
        referenceId,
        query: current?.query ?? '',
        index: (Math.max(current?.index ?? 0, 0) + delta + suggestions.length) % suggestions.length,
      }));
    } else if (event.key === 'Enter' && suggestions.length) {
      const recipe = suggestions[activeReferenceSuggestion?.index ?? 0];
      if (recipe) {
        event.preventDefault();
        chooseReferenceRecipe(referenceId, recipe);
      }
    } else if (event.key === 'Escape') {
      setActiveReferenceSuggestion(null);
    }
  }

  return (
    <>
      <input
        name="recipe_relationships"
        type="hidden"
        value={JSON.stringify(relationshipPayload)}
      />
      <fieldset className="recipe-relationship-editor">
        <legend>Pairs With</legend>
        <div className="recipe-relationship-rows" ref={pairingRowsRef}>
          {pairings.map((pairing) => {
            const pairingText = pairing.linked_recipe_id
              ? `#${slugify(pairing.display_text)}`
              : pairing.display_text;
            const suggestions = matchingPairingRecipes(pairingText);
            const isOpen = activeSuggestion?.pairingId === pairing.id && suggestions.length > 0;
            const activeIndex = Math.min(activeSuggestion?.index ?? 0, suggestions.length - 1);

            return (
              <div
                className={`recipe-relationship-row recipe-pairing-row${isOpen ? ' recipe-relationship-row-open' : ''}`}
                key={pairing.id}
              >
                <label className="recipe-field recipe-field-wide" htmlFor={`pairing-${pairing.id}`}>
                  <span className="visually-hidden">Pairing</span>
                  <input
                    aria-activedescendant={
                      isOpen ? `pairing-option-${pairing.id}-${activeIndex}` : undefined
                    }
                    aria-autocomplete="list"
                    aria-controls={`pairing-options-${pairing.id}`}
                    aria-expanded={isOpen}
                    autoComplete="off"
                    id={`pairing-${pairing.id}`}
                    role="combobox"
                    title="Type # and a recipe name to link a recipe."
                    value={pairingText}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPairings((current) =>
                        current.map((entry) =>
                          entry.id === pairing.id
                            ? { ...entry, display_text: value, linked_recipe_id: null }
                            : entry,
                        ),
                      );
                      const match = /#([\p{L}\p{N}-]*)$/u.exec(value);
                      setActiveSuggestion(
                        match ? { pairingId: pairing.id, query: match[1] ?? '', index: 0 } : null,
                      );
                    }}
                    onFocus={() => {
                      const match = /#([\p{L}\p{N}-]*)$/u.exec(pairingText);
                      if (match) {
                        setActiveSuggestion({
                          pairingId: pairing.id,
                          query: match[1] ?? '',
                          index: 0,
                        });
                      }
                    }}
                    onKeyDown={(event) => handlePairingKeyDown(event, pairing.id, suggestions)}
                  />
                </label>
                {isOpen && (
                  <div
                    aria-label="Recipe suggestions"
                    className="recipe-relationship-suggestions"
                    id={`pairing-options-${pairing.id}`}
                    role="listbox"
                  >
                    {suggestions.map((recipe, suggestionIndex) => (
                      <button
                        aria-selected={suggestionIndex === activeIndex}
                        id={`pairing-option-${pairing.id}-${suggestionIndex}`}
                        key={recipe.id}
                        role="option"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choosePairingRecipe(pairing.id, recipe)}
                      >
                        {recipe.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  aria-label="Remove pairing"
                  className="recipe-relationship-remove"
                  title="Remove pairing"
                  type="button"
                  onClick={() =>
                    setPairings((current) => current.filter(({ id }) => id !== pairing.id))
                  }
                >
                  <X aria-hidden="true" size={15} />
                </button>
              </div>
            );
          })}
          <button
            className="recipe-secondary-link recipe-relationship-add"
            type="button"
            onClick={() => setPairings((current) => [...current, createPairing()])}
          >
            Add pairing
          </button>
        </div>
      </fieldset>
      {children}
      <fieldset className="recipe-relationship-editor">
        <legend>References</legend>
        <div className="recipe-relationship-rows recipe-reference-list">
          <div aria-hidden="true" className="recipe-reference-heading">
            <span>Type</span>
            <span>Reference</span>
            <span />
            <span />
          </div>
          {references.map((reference, index) => {
            const isRecipeLookupOpen = activeReferenceSuggestion?.referenceId === reference.id;
            const suggestions = isRecipeLookupOpen
              ? matchingReferenceRecipes(activeReferenceSuggestion.query)
              : [];
            const activeIndex = Math.min(
              activeReferenceSuggestion?.index ?? 0,
              suggestions.length - 1,
            );

            return (
              <div
                className={`recipe-relationship-row recipe-reference-row${suggestions.length ? ' recipe-relationship-row-open' : ''}`}
                key={reference.id}
              >
                {reference.reference_type === 'publication' ? (
                  <span className="recipe-reference-legacy-type">Publication (legacy)</span>
                ) : (
                  <div className="recipe-field recipe-reference-field">
                    <span className="visually-hidden">Reference {index + 1} type</span>
                    <ReferenceTypePicker
                      id={`reference-${reference.id}-type`}
                      label={`Reference ${index + 1} type`}
                      value={reference.reference_type as EditableReferenceType}
                      onChange={(referenceType) => {
                        setReferences((current) =>
                          current.map((entry) =>
                            entry.id === reference.id
                              ? {
                                  ...entry,
                                  reference_type: referenceType,
                                  linked_recipe_id: null,
                                  publication_id: null,
                                  url: null,
                                  display_text: '',
                                }
                              : entry,
                          ),
                        );
                        setActiveReferenceSuggestion(null);
                      }}
                    />
                  </div>
                )}
                {reference.reference_type === 'publication' ? (
                  <span className="recipe-reference-legacy-text">{reference.display_text}</span>
                ) : reference.reference_type === 'recipe' ? (
                  <div className="recipe-reference-lookup">
                    <label className="recipe-field recipe-reference-field recipe-reference-field-fill">
                      <span className="visually-hidden">Reference {index + 1}</span>
                      <input
                        aria-activedescendant={
                          suggestions.length
                            ? `reference-${reference.id}-recipe-option-${activeIndex}`
                            : undefined
                        }
                        aria-autocomplete="list"
                        aria-controls={`reference-${reference.id}-recipe-options`}
                        aria-expanded={suggestions.length > 0}
                        aria-label={`Reference ${index + 1}`}
                        autoComplete="off"
                        role="combobox"
                        type="text"
                        value={reference.display_text}
                        onFocus={() =>
                          setActiveReferenceSuggestion({
                            referenceId: reference.id,
                            query: reference.display_text,
                            index: 0,
                          })
                        }
                        onBlur={() => setActiveReferenceSuggestion(null)}
                        onChange={(event) => {
                          const query = event.target.value;
                          setReferences((current) =>
                            current.map((entry) =>
                              entry.id === reference.id
                                ? { ...entry, linked_recipe_id: null, display_text: query }
                                : entry,
                            ),
                          );
                          setActiveReferenceSuggestion({
                            referenceId: reference.id,
                            query,
                            index: 0,
                          });
                        }}
                        onKeyDown={(event) =>
                          handleReferenceRecipeKeyDown(event, reference.id, suggestions)
                        }
                      />
                    </label>
                    {suggestions.length > 0 && (
                      <div
                        aria-label={`Recipe suggestions for Reference ${index + 1}`}
                        className="recipe-relationship-suggestions"
                        id={`reference-${reference.id}-recipe-options`}
                        role="listbox"
                      >
                        {suggestions.map((recipe, suggestionIndex) => (
                          <button
                            aria-selected={suggestionIndex === activeIndex}
                            id={`reference-${reference.id}-recipe-option-${suggestionIndex}`}
                            key={recipe.id}
                            role="option"
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseReferenceRecipe(reference.id, recipe)}
                          >
                            {recipe.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : reference.reference_type === 'external_url' ? (
                  <label className="recipe-field recipe-reference-field recipe-reference-field-fill">
                    <span className="visually-hidden">Reference {index + 1}</span>
                    <input
                      aria-label={`Reference ${index + 1}`}
                      required
                      inputMode="url"
                      type="text"
                      value={reference.url ?? ''}
                      onChange={(event) =>
                        setReferences((current) =>
                          current.map((entry) =>
                            entry.id === reference.id
                              ? {
                                  ...entry,
                                  url: event.target.value,
                                  display_text: event.target.value,
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                ) : (
                  <label className="recipe-field recipe-reference-field recipe-reference-field-fill">
                    <span className="visually-hidden">Reference {index + 1}</span>
                    <input
                      aria-label={`Reference ${index + 1}`}
                      required
                      value={reference.display_text}
                      onChange={(event) =>
                        setReferences((current) =>
                          current.map((entry) =>
                            entry.id === reference.id
                              ? { ...entry, display_text: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                <button
                  aria-label={`Remove Reference ${index + 1}`}
                  className="recipe-relationship-remove"
                  title={`Remove Reference ${index + 1}`}
                  type="button"
                  onClick={() =>
                    setReferences((current) => current.filter(({ id }) => id !== reference.id))
                  }
                >
                  <X aria-hidden="true" size={15} />
                </button>
              </div>
            );
          })}
          <button
            className="recipe-secondary-link recipe-relationship-add"
            type="button"
            onClick={() => setReferences((current) => [...current, createReference()])}
          >
            Add reference
          </button>
        </div>
      </fieldset>
    </>
  );
}
