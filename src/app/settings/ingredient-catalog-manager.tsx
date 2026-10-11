'use client';

import { ChevronRight, Merge, Plus, Search, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { manageIngredientCatalog } from '../actions/ingredient-catalog';
import { Picklist } from '../picklist';
import styles from './ingredient-catalog-manager.module.css';

export type IngredientCatalogEntry = {
  id: string;
  name: string;
};

type CatalogAction = 'add' | 'rename' | 'merge' | 'delete';
type ManagerMode = 'merge' | 'delete';

export function IngredientCatalogManager({
  initialIngredients,
  initialRevision,
  referenceCounts,
}: {
  initialIngredients: IngredientCatalogEntry[];
  initialRevision: number;
  referenceCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [revision, setRevision] = useState(initialRevision);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManagerMode>('merge');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addName, setAddName] = useState('');
  const [search, setSearch] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [mergeCounterpartId, setMergeCounterpartId] = useState('');
  const [mergeKeepId, setMergeKeepId] = useState('');
  const [panePosition, setPanePosition] = useState<{
    top: number | null;
    bottom: number | null;
    left: number;
    maxHeight: number;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTriggerRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIngredients(initialIngredients);
    setRevision(initialRevision);
  }, [initialIngredients, initialRevision]);

  useEffect(() => {
    if (editingId) renameInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    function cancelOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && renameInputRef.current?.contains(target)) return;
      setEditingId(null);
    }
    document.addEventListener('pointerdown', cancelOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', cancelOnOutsidePointer);
  }, [editingId]);

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const rows = [...ingredients].sort(
    (left, right) => collator.compare(left.name, right.name) || left.id.localeCompare(right.id),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const isWholeWordSearch = /\s$/.test(search);
  const wholeWordPattern = isWholeWordSearch
    ? new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`,
        'u',
      )
    : null;
  const filteredRows = normalizedSearch
    ? rows.filter((ingredient) =>
        wholeWordPattern
          ? wholeWordPattern.test(ingredient.name.toLocaleLowerCase())
          : ingredient.name.toLocaleLowerCase().includes(normalizedSearch),
      )
    : rows;
  const canAddSearch = normalizedSearch !== '' && filteredRows.length === 0;
  const searchAddName = search.replace(/\s+$/, '');
  const selectedIngredient = rows.find((ingredient) => ingredient.id === selectedId) ?? null;
  const selectedRecipeCount = selectedIngredient
    ? (referenceCounts[selectedIngredient.id] ?? 0)
    : 0;

  useLayoutEffect(() => {
    if (!selectedId) return;
    const pane = paneRef.current;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-ingredient-row]') ?? [],
    ).find((item) => item.dataset.ingredientRow === selectedId);
    if (!pane || !row) return;
    const activePane = pane;
    const activeRow = row;

    function updatePanePosition() {
      if (!window.matchMedia('(max-width: 760px)').matches) {
        setPanePosition(null);
        return;
      }

      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const rowBounds = activeRow.getBoundingClientRect();
      const paneBounds = activePane.getBoundingClientRect();
      const spaceAbove = Math.max(0, rowBounds.top - viewportTop - 8);
      const spaceBelow = Math.max(0, viewportBottom - rowBounds.bottom - 8);
      const placeBelow = spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, (placeBelow ? spaceBelow : spaceAbove) - 16);

      setPanePosition({
        top: placeBelow ? rowBounds.bottom + 8 : null,
        bottom: placeBelow ? null : viewportBottom - rowBounds.top + 8,
        left: Math.max(
          viewportLeft + 8,
          Math.min(
            rowBounds.right - paneBounds.width,
            viewportLeft + viewportWidth - paneBounds.width - 8,
          ),
        ),
        maxHeight,
      });
    }

    updatePanePosition();
    window.addEventListener('resize', updatePanePosition);
    window.addEventListener('scroll', updatePanePosition, true);
    window.visualViewport?.addEventListener('resize', updatePanePosition);
    window.visualViewport?.addEventListener('scroll', updatePanePosition);
    return () => {
      window.removeEventListener('resize', updatePanePosition);
      window.removeEventListener('scroll', updatePanePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePanePosition);
      window.visualViewport?.removeEventListener('scroll', updatePanePosition);
    };
  }, [selectedId]);

  const closePane = useCallback((restoreFocus = true) => {
    setSelectedId(null);
    setPanePosition(null);
    setReplacementId('');
    setMergeCounterpartId('');
    setMergeKeepId('');
    if (restoreFocus) requestAnimationFrame(() => paneTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || paneRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('[data-picklist-scope="ingredient-catalog-manager"]')
      ) {
        return;
      }
      closePane(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [closePane, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePane();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closePane, selectedId]);

  function submitMutation(
    action: CatalogAction,
    fields: { name: string; value: string }[],
    successMessage: string,
    afterSaved?: () => void,
  ) {
    const formData = new FormData();
    formData.set('action', action);
    formData.set('revision', String(revision));
    for (const field of fields) formData.append(field.name, field.value);

    startTransition(async () => {
      const result = await manageIngredientCatalog({}, formData);
      setStatus(result.status === 'saved' ? successMessage : (result.message ?? ''));
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        afterSaved?.();
        router.refresh();
      } else if (result.status === 'conflict') {
        router.refresh();
      }
    });
  }

  function addIngredient(event: FormEvent<HTMLFormElement>, name = addName) {
    event.preventDefault();
    addIngredientByName(name);
  }

  function addIngredientByName(name: string) {
    if (!name.trim()) return;
    submitMutation('add', [{ name: 'name', value: name }], 'Ingredient added.', () => {
      setAddName('');
    });
  }

  function saveRename(event: FormEvent<HTMLFormElement>, ingredient: IngredientCatalogEntry) {
    event.preventDefault();
    if (!editName.trim()) return;
    submitMutation(
      'rename',
      [
        { name: 'ingredient_id', value: ingredient.id },
        { name: 'name', value: editName },
      ],
      'Ingredient renamed.',
      () => setEditingId(null),
    );
  }

  function openPane(
    ingredient: IngredientCatalogEntry,
    nextMode: ManagerMode,
    trigger: HTMLButtonElement,
  ) {
    paneTriggerRef.current = trigger;
    setSelectedId(ingredient.id);
    setMode(nextMode);
    setReplacementId('');
    setMergeCounterpartId('');
    setMergeKeepId('');
  }

  function renderRow(ingredient: IngredientCatalogEntry) {
    return (
      <li className={styles.row} data-ingredient-row={ingredient.id} key={ingredient.id}>
        {editingId === ingredient.id ? (
          <form className={styles.inlineEditor} onSubmit={(event) => saveRename(event, ingredient)}>
            <input
              aria-label={`Rename ${ingredient.name}`}
              className={styles.inlineInput}
              maxLength={160}
              ref={renameInputRef}
              required
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditingId(null);
              }}
            />
          </form>
        ) : (
          <button
            aria-label={`Edit ${ingredient.name}`}
            className={styles.valueButton}
            disabled={isPending || Boolean(selectedId)}
            type="button"
            onClick={() => {
              setEditingId(ingredient.id);
              setEditName(ingredient.name);
            }}
          >
            {ingredient.name}
          </button>
        )}
        <div className={styles.rowActions}>
          <button
            aria-label={`Merge ${ingredient.name}`}
            className={styles.iconButton}
            disabled={isPending || Boolean(editingId)}
            title="Merge with another ingredient"
            type="button"
            onClick={(event) => openPane(ingredient, 'merge', event.currentTarget)}
          >
            <Merge aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={`Delete ${ingredient.name}`}
            className={styles.iconButton}
            disabled={isPending || Boolean(editingId)}
            title="Delete ingredient"
            type="button"
            onClick={(event) => openPane(ingredient, 'delete', event.currentTarget)}
          >
            <Trash2 aria-hidden="true" size={18} />
          </button>
        </div>
      </li>
    );
  }

  function renderPane() {
    if (!selectedIngredient) return null;
    const isMerge = mode === 'merge';
    const paneLabel = isMerge
      ? `Merge ${selectedIngredient.name}`
      : `Delete ${selectedIngredient.name}`;
    const options = rows
      .filter((ingredient) => ingredient.id !== selectedIngredient.id)
      .map((ingredient) => ({ value: ingredient.id, label: ingredient.name }));
    const mergeCounterpart = rows.find((ingredient) => ingredient.id === mergeCounterpartId);

    return (
      <section
        aria-label={paneLabel}
        className={`${styles.pane} ${isMerge ? styles.mergePane : ''}`}
        ref={paneRef}
        style={
          panePosition
            ? {
                top: panePosition.top ?? 'auto',
                bottom: panePosition.bottom ?? 'auto',
                left: panePosition.left,
                right: 'auto',
                maxHeight: panePosition.maxHeight,
              }
            : undefined
        }
      >
        <div className={styles.paneHeading}>
          <h3>{paneLabel}</h3>
          <button
            aria-label="Close"
            className={styles.iconButton}
            type="button"
            onClick={() => closePane()}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className={styles.form}>
          <p className={styles.note}>
            Used by {selectedRecipeCount} {selectedRecipeCount === 1 ? 'recipe' : 'recipes'}.
            {selectedRecipeCount > 0 && ' Recipe rows and instruction links stay in place.'}
          </p>
          {isMerge ? (
            <>
              <div className={styles.field}>
                <span>{`Merge ${selectedIngredient.name} with`}</span>
                <Picklist
                  className={styles.mergePicklist}
                  label={`Merge ${selectedIngredient.name} with`}
                  measureLabel="Ingredient"
                  menuClassName={styles.mergePicklistMenu}
                  options={options}
                  scope="ingredient-catalog-manager"
                  sizeToContent={false}
                  value={mergeCounterpartId}
                  onSelect={(value) => {
                    setMergeCounterpartId(value);
                    setMergeKeepId('');
                  }}
                >
                  {mergeCounterpart?.name ?? 'Choose an ingredient'}
                </Picklist>
              </div>
              <fieldset className={styles.keepChoices}>
                <legend>Keep as</legend>
                <button
                  aria-pressed={mergeKeepId === selectedIngredient.id}
                  className={styles.keepButton}
                  disabled={!mergeCounterpart || isPending}
                  type="button"
                  onClick={() => setMergeKeepId(selectedIngredient.id)}
                >
                  {selectedIngredient.name}
                </button>
                <button
                  aria-pressed={mergeKeepId === mergeCounterpart?.id}
                  className={styles.keepButton}
                  disabled={!mergeCounterpart || isPending}
                  type="button"
                  onClick={() => mergeCounterpart && setMergeKeepId(mergeCounterpart.id)}
                >
                  {mergeCounterpart?.name ?? 'ingredient'}
                </button>
              </fieldset>
              <button
                className={styles.saveButton}
                disabled={isPending || !mergeCounterpart || !mergeKeepId}
                type="button"
                onClick={() => {
                  const sourceId =
                    mergeKeepId === selectedIngredient.id
                      ? mergeCounterpartId
                      : selectedIngredient.id;
                  submitMutation(
                    'merge',
                    [
                      { name: 'ingredient_id', value: sourceId },
                      { name: 'replacement_id', value: mergeKeepId },
                    ],
                    'Ingredients merged.',
                    () => closePane(false),
                  );
                }}
              >
                Merge
              </button>
            </>
          ) : (
            <>
              {selectedRecipeCount > 0 && (
                <div className={styles.field}>
                  <span>Replace with</span>
                  <Picklist
                    className={styles.replacementPicklist}
                    label="Replace with"
                    measureLabel="Ingredient"
                    options={options}
                    scope="ingredient-catalog-manager"
                    sizeToContent={false}
                    value={replacementId}
                    onSelect={setReplacementId}
                  >
                    {options.find((option) => option.value === replacementId)?.label ??
                      'Choose an ingredient'}
                  </Picklist>
                </div>
              )}
              <button
                className={styles.deleteButton}
                disabled={isPending || (selectedRecipeCount > 0 && !replacementId)}
                type="button"
                onClick={() => {
                  submitMutation(
                    'delete',
                    [
                      { name: 'ingredient_id', value: selectedIngredient.id },
                      { name: 'replacement_id', value: replacementId },
                    ],
                    'Ingredient deleted.',
                    () => closePane(false),
                  );
                }}
              >
                Delete ingredient
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ingredient-catalog-title"
      className="settings-section ingredient-catalog-section"
    >
      <h2 className={styles.sectionHeading}>
        <button
          aria-controls="ingredient-catalog-editor"
          aria-expanded={isExpanded}
          className={styles.sectionToggle}
          id="ingredient-catalog-title"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <ChevronRight aria-hidden="true" className={styles.sectionChevron} size={18} />
          <span className={styles.sectionLabel}>Ingredients</span>
        </button>
      </h2>
      <div hidden={!isExpanded} id="ingredient-catalog-editor">
        <div className={styles.manager}>
          <div className={styles.toolbar}>
            <div className={styles.searchControls}>
              <label className={styles.searchField}>
                <Search aria-hidden="true" size={18} />
                <input
                  aria-label="Search ingredients"
                  autoComplete="off"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canAddSearch) {
                      event.preventDefault();
                      addIngredientByName(searchAddName);
                    } else if (event.key === 'Escape' && search) {
                      event.preventDefault();
                      setSearch('');
                    }
                  }}
                />
              </label>
              <button
                aria-label="Clear ingredient search"
                className={styles.clearButton}
                disabled={!search}
                title="Clear ingredient search"
                type="button"
                onClick={() => setSearch('')}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <span>
              {normalizedSearch
                ? `${filteredRows.length} of ${rows.length} ingredients`
                : `${rows.length} ingredients`}
            </span>
          </div>
          <div className={styles.columns}>
            <div className={styles.listColumn}>
              <ol aria-label="Ingredients" className={styles.list} ref={listRef}>
                {filteredRows.map(renderRow)}
              </ol>
              {filteredRows.length === 0 && !canAddSearch && (
                <p className={styles.emptyState}>No ingredients yet.</p>
              )}
              {canAddSearch ? (
                <form
                  className={`${styles.addRow} ${styles.searchAddRow}`}
                  onSubmit={(event) => addIngredient(event, searchAddName)}
                >
                  <button className={styles.addButton} disabled={isPending} type="submit">
                    <span>add {searchAddName}</span>
                  </button>
                </form>
              ) : (
                <form className={styles.addRow} onSubmit={addIngredient}>
                  <input
                    aria-label="Add ingredient"
                    className={styles.addInput}
                    maxLength={160}
                    placeholder="add ingredient"
                    required
                    value={addName}
                    onChange={(event) => setAddName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setAddName('');
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  {addName.trim() && (
                    <button
                      aria-label={`Add ${addName.trim()}`}
                      className={styles.addActionButton}
                      disabled={isPending}
                      title={`Add ${addName.trim()}`}
                      type="submit"
                    >
                      <Plus aria-hidden="true" size={18} />
                    </button>
                  )}
                </form>
              )}
            </div>
            {renderPane()}
          </div>
          <p aria-live="polite" className={styles.status} role="status">
            {isPending ? 'Saving...' : status}
          </p>
        </div>
      </div>
    </section>
  );
}
