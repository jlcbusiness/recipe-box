'use client';

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';

const CSS_PIXELS_PER_MILLIMETER = 96 / 25.4;
const TYPEAHEAD_TIMEOUT_MS = 700;

function getViewportBounds() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

export type PicklistOption = {
  value: string;
  label: string;
  group?: string;
};

export function usePicklistMenu({
  value,
  options,
  onSelect,
  onCommitEnter,
  onTabSelect,
  scope,
  selectOnTab = true,
  open,
  onOpenChange,
}: {
  value: string;
  options: PicklistOption[];
  onSelect: (value: string) => void;
  onCommitEnter?: () => void;
  onTabSelect?: (value: string) => boolean | undefined;
  scope?: string;
  selectOnTab?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [hasSelectedSinceFocus, setHasSelectedSinceFocus] = useState(false);
  const typeaheadBufferRef = useRef('');
  const typeaheadUpdatedAtRef = useRef(0);
  const isOpen = open ?? uncontrolledOpen;
  const [activeIndex, setActiveIndex] = useState(
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const setIsOpen = useCallback(
    (next: boolean | ((isOpen: boolean) => boolean)) => {
      const nextOpen = typeof next === 'function' ? next(isOpen) : next;
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      if (nextOpen !== isOpen) {
        onOpenChange?.(nextOpen);
      }
    },
    [isOpen, onOpenChange, open],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const positionMenu = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!bounds || !menu) {
        return;
      }
      const viewport = getViewportBounds();
      const appliedWidth = menu.style.width;
      menu.style.width = 'max-content';
      const naturalWidth = menu.getBoundingClientRect().width;
      menu.style.width = appliedWidth;
      const width = Math.min(
        Math.max(bounds.width, naturalWidth + CSS_PIXELS_PER_MILLIMETER),
        viewport.width - 24,
      );
      const idealHeight = Math.min(220, menu.scrollHeight);
      const aboveSpace = Math.max(0, bounds.top - viewport.top - 12);
      const belowSpace = Math.max(0, viewport.top + viewport.height - bounds.bottom - 12);
      const above = aboveSpace >= idealHeight || aboveSpace >= belowSpace;
      const maxHeight = Math.max(40, Math.min(idealHeight, above ? aboveSpace : belowSpace));
      setMenuPosition({
        left: Math.max(
          viewport.left + 12,
          Math.min(bounds.left, viewport.left + viewport.width - width - 12),
        ),
        top: above
          ? Math.max(viewport.top + 8, bounds.top - maxHeight - 4)
          : Math.min(bounds.bottom + 4, viewport.top + viewport.height - maxHeight - 8),
        width,
        maxHeight,
      });
    };
    const visualViewport = window.visualViewport;
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    visualViewport?.addEventListener('resize', positionMenu);
    visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      visualViewport?.removeEventListener('resize', positionMenu);
      visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      const menuScope =
        target instanceof Element
          ? target.closest('[data-picklist-scope]')?.getAttribute('data-picklist-scope')
          : null;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target) &&
        !(scope && menuScope === scope)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen, scope, setIsOpen]);

  useLayoutEffect(() => {
    if (isOpen) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeIndex, isOpen, listId]);

  useEffect(() => {
    if (!isOpen) {
      typeaheadBufferRef.current = '';
      typeaheadUpdatedAtRef.current = 0;
    }
  }, [isOpen]);

  function select(optionValue: string, returnFocus = true) {
    setHasSelectedSinceFocus(true);
    onSelect(optionValue);
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }

  function clearPendingSelection() {
    setHasSelectedSinceFocus(false);
  }

  function toggle() {
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setMenuPosition(null);
    setIsOpen(!isOpen);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        const selectedIndex = options.findIndex((option) => option.value === value);
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          options.length === 0
            ? 0
            : selectedIndex >= 0
              ? (selectedIndex + offset + options.length) % options.length
              : event.key === 'ArrowDown'
                ? 0
                : options.length - 1;
        setActiveIndex(nextIndex);
        setIsOpen(true);
        return;
      }
      if (options.length > 0) {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + offset + options.length) % options.length);
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        if (event.key === 'Enter' && hasSelectedSinceFocus && onCommitEnter) {
          setHasSelectedSinceFocus(false);
          onCommitEnter();
          return;
        }
        setActiveIndex(
          Math.max(
            0,
            options.findIndex((option) => option.value === value),
          ),
        );
        setIsOpen(true);
      } else if (options[activeIndex]) {
        select(options[activeIndex].value);
      }
    } else if (event.key === 'Tab' && isOpen) {
      if (selectOnTab && options[activeIndex]) {
        const chosenValue = options[activeIndex].value;
        select(chosenValue, false);
        if (onTabSelect?.(chosenValue)) {
          event.preventDefault();
        }
      } else {
        setIsOpen(false);
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (
      isOpen &&
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const typedCharacter = event.key.toLocaleLowerCase();
      const bufferIsFresh = now - typeaheadUpdatedAtRef.current <= TYPEAHEAD_TIMEOUT_MS;
      const previousBuffer = bufferIsFresh ? typeaheadBufferRef.current : '';
      const isRepeatedCharacter =
        previousBuffer.length > 0 &&
        Array.from(previousBuffer).every((character) => character === typedCharacter);
      const searchText = isRepeatedCharacter
        ? typedCharacter
        : `${previousBuffer}${typedCharacter}`;
      typeaheadBufferRef.current = searchText;
      typeaheadUpdatedAtRef.current = now;

      for (let offset = 1; offset <= options.length; offset += 1) {
        const candidateIndex = (activeIndex + offset) % options.length;
        if (options[candidateIndex].label.toLocaleLowerCase().startsWith(searchText)) {
          setActiveIndex(candidateIndex);
          break;
        }
      }
    }
  }

  return {
    activeIndex,
    clearPendingSelection,
    handleKeyDown,
    isOpen,
    listId,
    menuPosition,
    menuRef,
    select,
    setActiveIndex,
    setIsOpen,
    toggle,
    triggerRef,
  };
}

export function Picklist({
  id,
  label,
  value,
  options,
  onSelect,
  className,
  title,
  showArrow = true,
  sizeToContent = true,
  compact = false,
  showSelectionCheckmark = true,
  scope,
  autoFocus = false,
  disabled = false,
  describedBy,
  invalid,
  open,
  onOpenChange,
  onAddOption,
  onEnter,
  onFocusLeave,
  measureLabel,
  menuClassName,
  children,
}: {
  id?: string;
  label: string;
  value: string;
  options: PicklistOption[];
  onSelect: (value: string) => void;
  className: string;
  title?: string;
  showArrow?: boolean;
  sizeToContent?: boolean;
  compact?: boolean;
  showSelectionCheckmark?: boolean;
  scope?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAddOption?: (value: string) => Promise<{ valueId?: string; error?: string }>;
  onEnter?: () => boolean;
  onFocusLeave?: (relatedTarget: EventTarget | null) => void;
  measureLabel?: string;
  menuClassName?: string;
  children?: ReactNode;
}) {
  const {
    activeIndex,
    clearPendingSelection,
    handleKeyDown,
    isOpen,
    listId,
    menuPosition,
    menuRef,
    select,
    setActiveIndex,
    setIsOpen,
    toggle,
    triggerRef,
  } = usePicklistMenu({ value, options, onSelect, scope, open, onOpenChange });
  const [addDraft, setAddDraft] = useState('');
  const [addError, setAddError] = useState('');
  const [isAdding, startAddTransition] = useTransition();
  const selectedOption = options.find((option) => option.value === value);
  const longestOption = options.reduce(
    (longest, option) => (option.label.length > longest.length ? option.label : longest),
    measureLabel ?? '',
  );
  const measureRef = useRef<HTMLSpanElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number>();
  const portalTarget =
    typeof document === 'undefined'
      ? null
      : (triggerRef.current?.closest('dialog') ??
        triggerRef.current?.closest('main') ??
        document.body);

  useEffect(() => {
    if (!isOpen) {
      setAddDraft('');
      setAddError('');
    }
  }, [isOpen]);

  function submitAddOption() {
    if (!onAddOption || isAdding) {
      return;
    }
    const rawValue = addDraft.trim();
    if (!rawValue) {
      setAddError(`Enter a ${label.toLocaleLowerCase()} value before adding.`);
      return;
    }
    setAddError('');
    startAddTransition(async () => {
      const result = await onAddOption(addDraft);
      if (result.error || !result.valueId) {
        setAddError(result.error ?? `${label} could not be added. Try again.`);
        return;
      }
      setAddDraft('');
      select(result.valueId);
    });
  }

  useLayoutEffect(() => {
    if (!showArrow || !sizeToContent) {
      return;
    }
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerWidth(Math.ceil(measuredWidth + (compact ? 16 : 40)));
    }
  }, [compact, showArrow, sizeToContent]);

  useEffect(() => {
    if (autoFocus) {
      triggerRef.current?.focus();
    }
  }, [autoFocus, triggerRef]);

  return (
    <>
      {showArrow && (
        <span aria-hidden="true" className="single-picklist-measure" ref={measureRef}>
          {longestOption}
        </span>
      )}
      <button
        aria-activedescendant={isOpen && options.length ? `${listId}-${activeIndex}` : undefined}
        aria-controls={isOpen ? listId : undefined}
        aria-describedby={describedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-label={label}
        className={`single-picklist-trigger${compact ? ' is-compact' : ''} ${className}`}
        disabled={disabled}
        id={id}
        ref={triggerRef}
        role="combobox"
        style={
          showArrow && sizeToContent && triggerWidth
            ? { minWidth: `calc(${triggerWidth}px + 1mm)` }
            : undefined
        }
        title={title}
        type="button"
        onClick={toggle}
        onBlur={(event) => {
          clearPendingSelection();
          if (menuRef.current?.contains(event.relatedTarget as Node)) {
            return;
          }
          onFocusLeave?.(event.relatedTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter?.()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          handleKeyDown(event);
        }}
      >
        {children ?? selectedOption?.label}
        {showArrow && (
          <span aria-hidden="true" className="single-picklist-arrow">
            ▾
          </span>
        )}
      </button>
      {isOpen &&
        portalTarget &&
        createPortal(
          onAddOption ? (
            <div
              className={`single-picklist-menu single-picklist-menu-with-add${menuClassName ? ` ${menuClassName}` : ''}`}
              data-picklist-scope={scope}
              ref={menuRef}
              style={{
                ...(menuPosition ?? { left: 0, top: 0, maxHeight: 260 }),
                visibility: menuPosition ? 'visible' : 'hidden',
              }}
            >
              <div
                aria-label={label}
                className="single-picklist-options"
                id={listId}
                role="listbox"
                onMouseDown={(event) => event.preventDefault()}
              >
                {options.map((option, index) => (
                  <Fragment key={option.value}>
                    {option.group && options[index - 1]?.group !== option.group && (
                      <div className="single-picklist-group" role="presentation">
                        {option.group}
                      </div>
                    )}
                    <button
                      aria-selected={option.value === value}
                      className={`single-picklist-option${index === activeIndex ? ' is-active' : ''}`}
                      id={`${listId}-${index}`}
                      role="option"
                      tabIndex={-1}
                      type="button"
                      onClick={() => select(option.value)}
                      onPointerMove={() => setActiveIndex(index)}
                    >
                      {showSelectionCheckmark && (
                        <span aria-hidden="true" className="single-picklist-check">
                          {option.value === value ? '✓' : ''}
                        </span>
                      )}
                      <span>{option.label}</span>
                    </button>
                  </Fragment>
                ))}
              </div>
              <div className="single-picklist-add-row">
                <input
                  aria-label={`Add ${label}`}
                  autoComplete="off"
                  className="single-picklist-add-input"
                  placeholder={`Add ${label}…`}
                  size={8}
                  type="text"
                  value={addDraft}
                  onChange={(event) => {
                    setAddDraft(event.target.value);
                    if (addError) {
                      setAddError('');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      submitAddOption();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      setAddDraft('');
                      setAddError('');
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                />
                <button
                  aria-label={`Add ${label}`}
                  className="single-picklist-add-button"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitAddOption}
                >
                  +
                </button>
              </div>
              {addError && (
                <p className="single-picklist-add-error" role="alert">
                  {addError}
                </p>
              )}
            </div>
          ) : (
            <div
              className={`single-picklist-menu${menuClassName ? ` ${menuClassName}` : ''}`}
              data-picklist-scope={scope}
              id={listId}
              ref={menuRef}
              role="listbox"
              style={{
                ...(menuPosition ?? { left: 0, top: 0, maxHeight: 220 }),
                visibility: menuPosition ? 'visible' : 'hidden',
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <Fragment key={option.value}>
                  {option.group && options[index - 1]?.group !== option.group && (
                    <div className="single-picklist-group" role="presentation">
                      {option.group}
                    </div>
                  )}
                  <button
                    aria-selected={option.value === value}
                    className={`single-picklist-option${index === activeIndex ? ' is-active' : ''}`}
                    id={`${listId}-${index}`}
                    role="option"
                    tabIndex={-1}
                    type="button"
                    onClick={() => select(option.value)}
                    onPointerMove={() => setActiveIndex(index)}
                  >
                    {showSelectionCheckmark && (
                      <span aria-hidden="true" className="single-picklist-check">
                        {option.value === value ? '✓' : ''}
                      </span>
                    )}
                    <span>{option.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          ),
          portalTarget,
        )}
    </>
  );
}
