'use client';

import { Check, ChevronRight, Merge, Palette, Plus, Search, Trash2, X } from 'lucide-react';
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
import type { TagOption } from '../../lib/recipes/data';
import { getTagColorStyle, tagColorOptions } from '../../lib/recipes/tag-colors';
import { manageTagCatalog, setTagColor } from '../actions/tag-catalog';
import styles from './tag-catalog-manager.module.css';

type TagCounts = { recipes: number; publications: number };
type ManagerMode = 'merge' | 'delete' | 'color';
type PanePosition = {
  top: number | null;
  bottom: number | null;
  left: number;
  maxHeight: number;
};

function setTagShape(button: HTMLButtonElement | null) {
  if (!button) return;
  const style = getComputedStyle(button);
  const bounds = button.getBoundingClientRect();
  const borderWidth =
    Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth);
  const borderHeight =
    Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  const basePaddingInline = Number.parseFloat(style.getPropertyValue('--tag-base-padding-inline'));
  const basePaddingBlock = Number.parseFloat(style.getPropertyValue('--tag-base-padding-block'));
  const contentWidth =
    bounds.width -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight) -
    borderWidth;
  const contentHeight =
    bounds.height -
    Number.parseFloat(style.paddingTop) -
    Number.parseFloat(style.paddingBottom) -
    borderHeight;
  const baseWidth = contentWidth + basePaddingInline * 2 + borderWidth;
  const baseHeight = Math.max(
    Number.parseFloat(style.minHeight),
    contentHeight + basePaddingBlock * 2 + borderHeight,
  );
  button.dataset.tagShape = baseWidth <= baseHeight ? 'tall' : 'wide';
}

export function TagCatalogManager({
  initialTags,
  initialRevision,
  referenceCounts,
}: {
  initialTags: TagOption[];
  initialRevision: number;
  referenceCounts: Record<string, TagCounts>;
}) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [revision, setRevision] = useState(initialRevision);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addName, setAddName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManagerMode>('merge');
  const [counterpartId, setCounterpartId] = useState('');
  const [keepId, setKeepId] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [panePosition, setPanePosition] = useState<PanePosition | null>(null);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTriggerRef = useRef<HTMLButtonElement>(null);

  const closePane = useCallback((restoreFocus = true) => {
    setSelectedId(null);
    setPanePosition(null);
    setCounterpartId('');
    setKeepId('');
    setReplacementId('');
    if (restoreFocus) requestAnimationFrame(() => paneTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    setTags(initialTags);
    setRevision(initialRevision);
  }, [initialTags, initialRevision]);

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

  useLayoutEffect(() => {
    if (!selectedId) {
      setPanePosition(null);
      return;
    }
    const pane = paneRef.current;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-tag-row]') ?? [],
    ).find((item) => item.dataset.tagRow === selectedId);
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

  useEffect(() => {
    if (!selectedId) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || paneRef.current?.contains(target)) return;
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

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const rows = [...tags].sort(
    (left, right) => collator.compare(left.name, right.name) || left.id.localeCompare(right.id),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const isWholeWordSearch = /\s$/.test(search);
  const wholeWordPattern = isWholeWordSearch
    ? new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${normalizedSearch.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:$|[^\\p{L}\\p{N}])`,
        'u',
      )
    : null;
  const filteredRows = normalizedSearch
    ? rows.filter((tag) =>
        wholeWordPattern
          ? wholeWordPattern.test(tag.name.toLocaleLowerCase())
          : tag.name.toLocaleLowerCase().includes(normalizedSearch),
      )
    : rows;
  const canAddSearch = normalizedSearch !== '' && filteredRows.length === 0;
  const searchAddName = search.replace(/\s+$/, '');
  const selectedTag = rows.find((tag) => tag.id === selectedId) ?? null;
  const selectedCounts = selectedTag
    ? (referenceCounts[selectedTag.id] ?? { recipes: 0, publications: 0 })
    : { recipes: 0, publications: 0 };
  const hasAssignments = selectedCounts.recipes + selectedCounts.publications > 0;
  const counterpart = rows.find((tag) => tag.id === counterpartId) ?? null;

  function submitMutation(
    action: 'add' | 'rename' | 'merge' | 'delete',
    fields: { name: string; value: string }[],
    successMessage: string,
    afterSaved?: () => void,
  ) {
    const formData = new FormData();
    formData.set('action', action);
    formData.set('revision', String(revision));
    for (const field of fields) formData.append(field.name, field.value);
    setStatus('');
    setErrorMessage('');

    startTransition(async () => {
      const result = await manageTagCatalog({}, formData);
      if (result.status === 'saved') {
        setRevision(result.revision ?? revision + 1);
        setStatus(successMessage);
        afterSaved?.();
        router.refresh();
      } else {
        setErrorMessage(result.message ?? 'Tag catalog could not be updated.');
        if (result.status === 'conflict') router.refresh();
      }
    });
  }

  function addTag(event: FormEvent<HTMLFormElement>, name = addName) {
    event.preventDefault();
    addTagByName(name);
  }

  function addTagByName(name: string) {
    if (!name.trim()) return;
    submitMutation('add', [{ name: 'name', value: name }], 'Tag added.', () => setAddName(''));
  }

  function chooseTagColor(tag: TagOption, colorKey: TagOption['color_key']) {
    setStatus('');
    setErrorMessage('');
    startTransition(async () => {
      const result = await setTagColor(tag.id, colorKey, revision);
      if (result.status === 'saved') {
        setTags((current) =>
          current.map((currentTag) =>
            currentTag.id === tag.id ? { ...currentTag, color_key: colorKey } : currentTag,
          ),
        );
        setRevision(result.revision ?? revision + 1);
        closePane(false);
        setStatus('Tag color updated.');
        router.refresh();
      } else {
        setErrorMessage(result.message ?? 'Tag color could not be updated.');
        if (result.status === 'conflict') router.refresh();
      }
    });
  }

  function saveRename(event: FormEvent<HTMLFormElement>, tag: TagOption) {
    event.preventDefault();
    if (!editName.trim()) return;
    submitMutation(
      'rename',
      [
        { name: 'tag_id', value: tag.id },
        { name: 'name', value: editName },
      ],
      'Tag renamed.',
      () => setEditingId(null),
    );
  }

  function openPane(tag: TagOption, nextMode: ManagerMode, trigger: HTMLButtonElement) {
    paneTriggerRef.current = trigger;
    setSelectedId(tag.id);
    setMode(nextMode);
    setCounterpartId('');
    setKeepId('');
    setReplacementId('');
    setStatus('');
    setErrorMessage('');
  }

  function renderPane() {
    if (!selectedTag) return null;
    const isMerge = mode === 'merge';
    const isDelete = mode === 'delete';
    const isColor = mode === 'color';
    const label = isMerge
      ? `Merge ${selectedTag.name}`
      : isDelete
        ? `Delete ${selectedTag.name}`
        : `Change color for ${selectedTag.name}`;
    const otherTags = rows.filter((tag) => tag.id !== selectedTag.id);
    const recipeText = `${selectedCounts.recipes} ${selectedCounts.recipes === 1 ? 'recipe' : 'recipes'}`;
    const publicationText = `${selectedCounts.publications} ${selectedCounts.publications === 1 ? 'publication' : 'publications'}`;

    return (
      <section
        aria-label={label}
        className={`${styles.pane} ${isMerge ? styles.mergePane : ''} ${isDelete ? styles.deletePane : ''}`}
        ref={paneRef}
        style={
          panePosition
            ? {
                position: 'fixed',
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
          <h3>{label}</h3>
          <button
            aria-label="Close"
            className={styles.iconButton}
            type="button"
            onClick={() => closePane()}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        {!isColor && (
          <p className={styles.note}>
            Used by {recipeText} and {publicationText}.
          </p>
        )}
        {isColor ? (
          <fieldset aria-label={`Color for ${selectedTag.name}`} className={styles.colorPalette}>
            <legend>Tag color</legend>
            <div className={styles.colorChoices}>
              {tagColorOptions.map((color) => (
                <button
                  key={color.key}
                  aria-label={`Set ${selectedTag.name} color to ${color.label}`}
                  aria-pressed={selectedTag.color_key === color.key}
                  className={styles.colorSwatch}
                  disabled={isPending}
                  title={color.label}
                  type="button"
                  onClick={() => chooseTagColor(selectedTag, color.key)}
                  style={getTagColorStyle(color.key)}
                >
                  {selectedTag.color_key === color.key && <Check aria-hidden="true" size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
        ) : isMerge ? (
          <>
            <label className={styles.field}>
              {`Merge ${selectedTag.name} with`}
              <select
                aria-label={`Merge ${selectedTag.name} with`}
                className={styles.select}
                value={counterpartId}
                onChange={(event) => {
                  setCounterpartId(event.currentTarget.value);
                  setKeepId('');
                }}
              >
                <option value="">Choose a tag</option>
                {otherTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.keepChoices}>
              <legend>Keep as</legend>
              <button
                aria-pressed={keepId === selectedTag.id}
                className={styles.keepButton}
                disabled={!counterpart || isPending}
                type="button"
                onClick={() => setKeepId(selectedTag.id)}
              >
                {selectedTag.name}
              </button>
              <button
                aria-pressed={keepId === counterpart?.id}
                className={styles.keepButton}
                disabled={!counterpart || isPending}
                type="button"
                onClick={() => counterpart && setKeepId(counterpart.id)}
              >
                {counterpart?.name ?? 'tag'}
              </button>
            </fieldset>
            <button
              className={styles.saveButton}
              disabled={!counterpart || !keepId || isPending}
              type="button"
              onClick={() => {
                const sourceId = keepId === selectedTag.id ? counterpartId : selectedTag.id;
                submitMutation(
                  'merge',
                  [
                    { name: 'tag_id', value: sourceId },
                    { name: 'replacement_id', value: keepId },
                  ],
                  'Tags merged.',
                  closePane,
                );
              }}
            >
              Merge
            </button>
          </>
        ) : (
          <>
            {hasAssignments && (
              <label className={styles.field}>
                Replace with
                <select
                  aria-label="Replace with"
                  className={styles.select}
                  value={replacementId}
                  onChange={(event) => setReplacementId(event.currentTarget.value)}
                >
                  <option value="">Choose a replacement</option>
                  {otherTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className={isDelete ? styles.deleteButton : styles.saveButton}
              disabled={isPending || (hasAssignments && !replacementId)}
              type="button"
              onClick={() =>
                submitMutation(
                  'delete',
                  [
                    { name: 'tag_id', value: selectedTag.id },
                    ...(replacementId ? [{ name: 'replacement_id', value: replacementId }] : []),
                  ],
                  'Tag deleted.',
                  closePane,
                )
              }
            >
              Delete tag
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Tags"
      className={`${styles.manager} settings-section settings-accordion-section`}
    >
      <h2 className={styles.heading}>
        <button
          aria-expanded={isExpanded}
          aria-label="Edit tags"
          className={styles.toggle}
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <ChevronRight aria-hidden="true" className={styles.chevron} size={18} />
          <span aria-hidden="true" className={styles.label}>
            Tags
          </span>
        </button>
      </h2>
      {isExpanded && (
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <div className={styles.searchControls}>
              <label className={styles.searchField}>
                <Search aria-hidden="true" size={18} />
                <input
                  aria-label="Search tags"
                  autoComplete="off"
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    setSelectedId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canAddSearch) {
                      event.preventDefault();
                      addTagByName(searchAddName);
                    } else if (event.key === 'Escape' && search) {
                      event.preventDefault();
                      setSearch('');
                      setSelectedId(null);
                    }
                  }}
                />
              </label>
              <button
                aria-label="Clear tag search"
                className={styles.clearButton}
                disabled={!search}
                title="Clear tag search"
                type="button"
                onClick={() => setSearch('')}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <span>
              {normalizedSearch
                ? `${filteredRows.length} of ${rows.length} tags`
                : `${rows.length} tags`}
            </span>
          </div>
          <div className={styles.columns}>
            <div className={styles.listColumn}>
              {filteredRows.length > 0 ? (
                <ul aria-label="Tags" className={styles.list} ref={listRef}>
                  {filteredRows.map((tag) => (
                    <li className={styles.row} data-tag-row={tag.id} key={tag.id}>
                      {editingId === tag.id ? (
                        <form
                          className={styles.inlineEditor}
                          onSubmit={(event) => saveRename(event, tag)}
                        >
                          <input
                            aria-label={`Rename ${tag.name}`}
                            className={styles.input}
                            maxLength={160}
                            required
                            ref={renameInputRef}
                            value={editName}
                            onChange={(event) => setEditName(event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') setEditingId(null);
                            }}
                          />
                        </form>
                      ) : (
                        <button
                          aria-label={`Edit ${tag.name}`}
                          className={styles.valueButton}
                          ref={setTagShape}
                          disabled={isPending || Boolean(selectedId)}
                          type="button"
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditName(tag.name);
                          }}
                          style={getTagColorStyle(tag.color_key)}
                        >
                          {tag.name}
                        </button>
                      )}
                      <div className={styles.rowActions}>
                        <button
                          aria-label={`Change color for ${tag.name}`}
                          aria-expanded={selectedId === tag.id && mode === 'color'}
                          className={styles.colorButton}
                          disabled={isPending || Boolean(selectedId) || Boolean(editingId)}
                          title="Change tag color"
                          type="button"
                          onClick={(event) => openPane(tag, 'color', event.currentTarget)}
                        >
                          <span aria-hidden="true" style={getTagColorStyle(tag.color_key)}>
                            <Palette size={17} />
                          </span>
                        </button>
                        <button
                          aria-label={`Merge ${tag.name}`}
                          aria-expanded={selectedId === tag.id && mode === 'merge'}
                          className={styles.iconButton}
                          disabled={isPending || Boolean(editingId) || Boolean(selectedId)}
                          title="Merge with another tag"
                          type="button"
                          onClick={(event) => openPane(tag, 'merge', event.currentTarget)}
                        >
                          <Merge aria-hidden="true" size={18} />
                        </button>
                        <button
                          aria-label={`Delete ${tag.name}`}
                          aria-expanded={selectedId === tag.id && mode === 'delete'}
                          className={styles.iconButton}
                          disabled={isPending || Boolean(editingId) || Boolean(selectedId)}
                          title="Delete tag"
                          type="button"
                          onClick={(event) => openPane(tag, 'delete', event.currentTarget)}
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : canAddSearch ? (
                <form
                  className={`${styles.addRow} ${styles.searchAddRow}`}
                  onSubmit={(event) => addTag(event, searchAddName)}
                >
                  <button className={styles.addButton} disabled={isPending} type="submit">
                    add {searchAddName}
                  </button>
                </form>
              ) : rows.length === 0 ? (
                <p className={styles.empty}>No tags yet.</p>
              ) : (
                <p className={styles.empty}>No matching tags.</p>
              )}
              {!canAddSearch && (
                <form className={styles.addRow} onSubmit={addTag}>
                  <input
                    aria-label="Add tag"
                    className={styles.addInput}
                    maxLength={160}
                    placeholder="add tag"
                    required
                    value={addName}
                    onChange={(event) => setAddName(event.currentTarget.value)}
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
          {status && (
            <p className={styles.status} role="status">
              {status}
            </p>
          )}
          {errorMessage && (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
