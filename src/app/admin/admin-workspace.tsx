'use client';

import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import type { AdminUpdate } from '../../lib/admin-updates/rules';
import { AdminUpdates } from './admin-updates';

const tabs = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'updates', label: 'Updates' },
] as const;

type AdminTab = (typeof tabs)[number]['id'];

export function AdminWorkspace({
  accounts,
  updates,
}: {
  accounts: ReactNode;
  updates: AdminUpdate[];
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('accounts');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <>
      <div aria-label="Administration sections" className="admin-tabs" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`admin-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className="admin-tab"
            id={`admin-tab-${tab.id}`}
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby="admin-tab-accounts"
        className="admin-tab-panel"
        hidden={activeTab !== 'accounts'}
        id="admin-panel-accounts"
        role="tabpanel"
      >
        {accounts}
      </div>
      <div
        aria-labelledby="admin-tab-updates"
        className="admin-tab-panel"
        hidden={activeTab !== 'updates'}
        id="admin-panel-updates"
        role="tabpanel"
      >
        <AdminUpdates updates={updates} />
      </div>
    </>
  );
}
