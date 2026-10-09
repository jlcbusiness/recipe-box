'use client';

import { Ruler } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MeasurementSystem } from '../lib/recipes/measurement-rules';
import { saveUnitPreferences } from './actions/unit-preferences';
import { Picklist, type PicklistOption } from './picklist';

const measurementSystemOptions: PicklistOption[] = [
  { value: 'us_customary', label: 'US' },
  { value: 'metric', label: 'Metric' },
];

export function UnitsMenu({
  volumeSystem,
  weightSystem,
}: {
  volumeSystem: MeasurementSystem;
  weightSystem: MeasurementSystem;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const scope = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const changedDimensionRef = useRef<HTMLInputElement>(null);
  const volumeSystemRef = useRef<HTMLInputElement>(null);
  const weightSystemRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [systems, setSystems] = useState({ volume: volumeSystem, weight: weightSystem });
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [state, formAction, isPending] = useActionState(saveUnitPreferences, {});

  useEffect(() => {
    setSystems({ volume: volumeSystem, weight: weightSystem });
  }, [volumeSystem, weightSystem]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelPosition(null);
      return;
    }

    const positionPanel = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!bounds || !panel) {
        return;
      }

      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const width = Math.min(panel.getBoundingClientRect().width, viewportWidth - 24);
      const aboveSpace = Math.max(0, bounds.top - viewportTop - 8);
      const belowSpace = Math.max(0, viewportTop + viewportHeight - bounds.bottom - 8);
      const above = aboveSpace > belowSpace;
      const maxHeight = Math.max(0, Math.min(viewportHeight - 24, above ? aboveSpace : belowSpace));
      const height = Math.min(panel.scrollHeight, maxHeight);

      setPanelPosition({
        left: Math.max(
          viewportLeft + 12,
          Math.min(bounds.left, viewportLeft + viewportWidth - width - 12),
        ),
        top: above
          ? Math.max(viewportTop + 12, bounds.top - height - 8)
          : Math.min(bounds.bottom + 8, viewportTop + viewportHeight - height - 12),
        width,
        maxHeight,
      });
    };

    const visualViewport = window.visualViewport;
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    visualViewport?.addEventListener('resize', positionPanel);
    visualViewport?.addEventListener('scroll', positionPanel);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
      visualViewport?.removeEventListener('resize', positionPanel);
      visualViewport?.removeEventListener('scroll', positionPanel);
    };
  }, [isOpen]);

  useEffect(() => {
    if (state.status === 'saved') {
      router.refresh();
    } else if (state.status === 'error') {
      setSystems({ volume: volumeSystem, weight: weightSystem });
    }
  }, [router, state, volumeSystem, weightSystem]);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      const targetScope =
        target instanceof Element
          ? target.closest('[data-picklist-scope]')?.getAttribute('data-picklist-scope')
          : null;
      if (target instanceof Node && !menuRef.current?.contains(target) && targetScope !== scope) {
        menuRef.current?.removeAttribute('open');
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && menuRef.current?.open) {
        menuRef.current.removeAttribute('open');
        menuRef.current.querySelector('summary')?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [scope]);

  function updateSystem(dimension: 'volume' | 'weight', value: MeasurementSystem) {
    setSystems((current) => ({ ...current, [dimension]: value }));
    if (changedDimensionRef.current) {
      changedDimensionRef.current.value = dimension;
    }
    const systemRef = dimension === 'volume' ? volumeSystemRef : weightSystemRef;
    if (systemRef.current) {
      systemRef.current.value = value;
    }
    menuRef.current?.querySelector('form')?.requestSubmit();
  }

  return (
    <details
      className="units-menu"
      ref={menuRef}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary aria-label="Units" className="units-menu-trigger" ref={triggerRef} title="Units">
        <Ruler aria-hidden="true" size={18} strokeWidth={1.8} />
        <span>Units</span>
      </summary>
      <div
        className="units-menu-panel"
        ref={panelRef}
        style={{
          left: panelPosition?.left ?? 0,
          top: panelPosition?.top ?? 0,
          width: panelPosition?.width,
          maxHeight: panelPosition?.maxHeight,
          visibility: panelPosition ? 'visible' : 'hidden',
        }}
      >
        <form action={formAction} aria-busy={isPending}>
          <input name="changed_dimension" ref={changedDimensionRef} type="hidden" value="volume" />
          <input name="volume_system" ref={volumeSystemRef} type="hidden" value={systems.volume} />
          <input name="weight_system" ref={weightSystemRef} type="hidden" value={systems.weight} />
          <div className="units-menu-field">
            <span>Volume</span>
            <Picklist
              className="units-menu-picklist"
              disabled={isPending}
              label="Volume"
              options={measurementSystemOptions}
              scope={scope}
              value={systems.volume}
              onSelect={(value) => updateSystem('volume', value as MeasurementSystem)}
            />
          </div>
          <div className="units-menu-field">
            <span>Weight</span>
            <Picklist
              className="units-menu-picklist"
              disabled={isPending}
              label="Weight"
              options={measurementSystemOptions}
              scope={scope}
              value={systems.weight}
              onSelect={(value) => updateSystem('weight', value as MeasurementSystem)}
            />
          </div>
        </form>
        <p aria-live="polite" className="units-menu-status" role="status">
          {isPending ? 'Saving...' : state.message}
        </p>
      </div>
    </details>
  );
}
