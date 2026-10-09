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
} from 'react';
import { createPortal } from 'react-dom';

const CSS_PIXELS_PER_MILLIMETER = 96 / 25.4;

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
  scope,
  selectOnTab = true,
  open,
  onOpenChange,
}: {
  value: string;
  options: PicklistOption[];
  onSelect: (value: string) => void;
  scope?: string;
  selectOnTab?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
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

  function select(optionValue: string, returnFocus = true) {
    onSelect(optionValue);
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
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
        setActiveIndex(
          Math.max(
            0,
            options.findIndex((option) => option.value === value),
          ),
        );
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
      if (!isOpen) {
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
        select(options[activeIndex].value, false);
      } else {
        setIsOpen(false);
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  return {
    activeIndex,
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
  label,
  value,
  options,
  onSelect,
  className,
  title,
  showArrow = true,
  scope,
  autoFocus = false,
  disabled = false,
  describedBy,
  invalid,
  open,
  onOpenChange,
  measureLabel,
  menuClassName,
  children,
}: {
  label: string;
  value: string;
  options: PicklistOption[];
  onSelect: (value: string) => void;
  className: string;
  title?: string;
  showArrow?: boolean;
  scope?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  measureLabel?: string;
  menuClassName?: string;
  children?: ReactNode;
}) {
  const {
    activeIndex,
    handleKeyDown,
    isOpen,
    listId,
    menuPosition,
    menuRef,
    select,
    setActiveIndex,
    toggle,
    triggerRef,
  } = usePicklistMenu({ value, options, onSelect, scope, open, onOpenChange });
  const selectedOption = options.find((option) => option.value === value);
  const longestOption = options.reduce(
    (longest, option) => (option.label.length > longest.length ? option.label : longest),
    measureLabel ?? '',
  );
  const measureRef = useRef<HTMLSpanElement>(null);
  const [triggerWidth, setTriggerWidth] = useState<number>();

  useLayoutEffect(() => {
    if (!showArrow) {
      return;
    }
    const measuredWidth = measureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setTriggerWidth(Math.ceil(measuredWidth + 40));
    }
  }, [showArrow]);

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
        className={`single-picklist-trigger ${className}`}
        disabled={disabled}
        ref={triggerRef}
        role="combobox"
        style={
          showArrow && triggerWidth ? { minWidth: `calc(${triggerWidth}px + 1mm)` } : undefined
        }
        title={title}
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        {children ?? selectedOption?.label}
        {showArrow && (
          <span aria-hidden="true" className="single-picklist-arrow">
            ▾
          </span>
        )}
      </button>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
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
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span aria-hidden="true" className="single-picklist-check">
                    {option.value === value ? '✓' : ''}
                  </span>
                  <span>{option.label}</span>
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
