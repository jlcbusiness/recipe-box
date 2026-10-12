'use client';

import { Check, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useState, useTransition } from 'react';
import type { TagOption } from '../../lib/recipes/data';
import { getTagColorStyle } from '../../lib/recipes/tag-colors';
import { createOrGetTag } from '../actions/tag-catalog';
import styles from './tag-controls.module.css';

export function TagMultiSelect({
  tags,
  selectedIds = [],
}: {
  tags: TagOption[];
  selectedIds?: string[];
}) {
  const listId = `${useId()}-tag-options`;
  const [availableTags, setAvailableTags] = useState(tags);
  const [selected, setSelected] = useState(selectedIds);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [inputWidth, setInputWidth] = useState(96);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const selectedTags = selected
    .map((id) => availableTags.find((tag) => tag.id === id))
    .filter((tag): tag is TagOption => Boolean(tag));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const exactMatch = availableTags.find((tag) => tag.name.toLocaleLowerCase() === normalizedQuery);
  const suggestions = availableTags
    .filter(
      (tag) =>
        !selected.includes(tag.id) &&
        normalizedQuery.length > 0 &&
        tag.name.toLocaleLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => {
      const leftRank = left.name.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const rightRank = right.name.toLocaleLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    })
    .slice(0, 8);
  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !availableTags.some((tag) => tag.name.toLocaleLowerCase() === normalizedQuery);
  const options = [
    ...suggestions.map((tag) => ({ kind: 'tag' as const, tag })),
    ...(canCreate ? [{ kind: 'create' as const, name: query.trim() }] : []),
  ];

  function selectTag(tag: TagOption) {
    setSelected((current) => (current.includes(tag.id) ? current : [...current, tag.id]));
    setQuery('');
    setIsOpen(false);
    setMessage('');
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.kind === 'tag') {
      selectTag(option.tag);
      return;
    }

    setMessage('');
    startTransition(async () => {
      const result = await createOrGetTag(option.name);
      if (!result.tag) {
        setMessage(result.error ?? 'Tag could not be added.');
        return;
      }
      setAvailableTags((current) =>
        current.some((tag) => tag.id === result.tag?.id)
          ? current
          : [...current, result.tag as TagOption],
      );
      selectTag(result.tag);
      if (result.created) setMessage(`Created ${result.tag.name}.`);
    });
  }

  return (
    <fieldset className={styles.multiSelect}>
      <legend>Tags</legend>
      <ul aria-label="Tags" className={styles.chips}>
        {selectedTags.map((tag) => (
          <li className={styles.chip} key={tag.id} style={getTagColorStyle(tag.color_key)}>
            <span>{tag.name}</span>
            <button
              aria-label={`Remove ${tag.name}`}
              className={styles.removeButton}
              title={`Remove ${tag.name}`}
              type="button"
              onClick={() => setSelected((current) => current.filter((id) => id !== tag.id))}
            >
              <X aria-hidden="true" size={14} />
            </button>
          </li>
        ))}
        <li className={styles.pickerItem}>
          <div className={styles.picker}>
            <input
              aria-activedescendant={
                isOpen && options.length > 0 ? `${listId}-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={isOpen && options.length > 0}
              aria-label="Add or find a tag"
              autoComplete="off"
              className={styles.input}
              disabled={isPending}
              placeholder="add tag"
              role="combobox"
              style={{ width: `${inputWidth}px` }}
              value={query}
              onChange={(event) => {
                const input = event.currentTarget;
                setQuery(input.value);
                const context = document.createElement('canvas').getContext('2d');
                if (context) {
                  context.font = getComputedStyle(input).font;
                  setInputWidth(
                    Math.max(96, Math.ceil(context.measureText(input.value).width + 12)),
                  );
                }
                setActiveIndex(0);
                setIsOpen(true);
                setMessage('');
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && options.length > 0) {
                  event.preventDefault();
                  setActiveIndex((current) => (current + 1) % options.length);
                } else if (event.key === 'ArrowUp' && options.length > 0) {
                  event.preventDefault();
                  setActiveIndex((current) => (current - 1 + options.length) % options.length);
                } else if (event.key === 'Enter' && isOpen && options.length > 0) {
                  event.preventDefault();
                  chooseOption(activeIndex);
                } else if (event.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
            />
            {isOpen && options.length > 0 && (
              <div className={styles.options} id={listId} role="listbox">
                {options.map((option, index) => (
                  <button
                    aria-selected={index === activeIndex}
                    className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''}`}
                    id={`${listId}-${index}`}
                    key={option.kind === 'tag' ? option.tag.id : `create-${option.name}`}
                    role="option"
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => chooseOption(index)}
                  >
                    {option.kind === 'tag' ? (
                      <>
                        <span
                          className={styles.optionSwatch}
                          style={getTagColorStyle(option.tag.color_key)}
                        />
                        <span>{option.tag.name}</span>
                        {index === activeIndex && <Check aria-hidden="true" size={16} />}
                      </>
                    ) : (
                      <>
                        <Plus aria-hidden="true" size={16} />
                        <span>Create tag “{option.name}”</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </li>
      </ul>
      {selected.map((id) => (
        <input key={id} name="tag_ids" type="hidden" value={id} />
      ))}
      {(message || (exactMatch && selected.includes(exactMatch.id))) && (
        <p className={styles.status} role="status">
          {message || `${exactMatch?.name} is already selected.`}
        </p>
      )}
      {isOpen && normalizedQuery && options.length === 0 && (
        <p className={styles.empty}>No matching tags.</p>
      )}
    </fieldset>
  );
}

export function TagChips({
  tags,
  trailingActions,
}: {
  tags: TagOption[];
  trailingActions?: ReactNode;
}) {
  if (tags.length === 0 && !trailingActions) return null;

  return (
    <ul
      aria-label="Tags"
      className={`${styles.chips} ${trailingActions ? styles.chipsWithActions : ''}`}
    >
      {tags.map((tag) => (
        <li className={styles.chip} key={tag.id} style={getTagColorStyle(tag.color_key)}>
          {tag.name}
        </li>
      ))}
      {trailingActions && <li className={styles.trailingActions}>{trailingActions}</li>}
    </ul>
  );
}
