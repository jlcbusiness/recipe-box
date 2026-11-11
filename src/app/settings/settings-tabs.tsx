'use client';

import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';

const tabs = [
  { id: 'preferences', label: 'Preferences', labelLines: ['Preferences'] },
  { id: 'recipe-data', label: 'Recipe data', labelLines: ['Recipe', 'data'] },
  { id: 'account-data', label: 'Account & data', labelLines: ['Account', '& data'] },
] as const;

type SettingsTabId = (typeof tabs)[number]['id'];

export function SettingsTabs({
  initialTab,
  resetFallback,
  preferences,
  recipeData,
  accountData,
}: {
  initialTab?: string;
  resetFallback: boolean;
  preferences: ReactNode;
  recipeData: ReactNode;
  accountData: ReactNode;
}) {
  const requestedTab = tabs.find((tab) => tab.id === initialTab);
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    requestedTab?.id ?? (resetFallback ? 'account-data' : 'preferences'),
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function activateTab(tabId: SettingsTabId) {
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState(null, '', url);
  }

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
      activateTab(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  }

  const panelContent: Record<SettingsTabId, ReactNode> = {
    preferences,
    'recipe-data': recipeData,
    'account-data': accountData,
  };

  return (
    <>
      <div aria-label="Settings areas" className="settings-tabs" role="tablist">
        {tabs.map((tab, index) => (
          <button
            aria-controls={`settings-panel-${tab.id}`}
            aria-label={tab.label}
            aria-selected={activeTab === tab.id}
            className="settings-tab"
            id={`settings-tab-${tab.id}`}
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
            onClick={() => activateTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <span className="settings-tab-label">
              {tab.labelLines.map((line, lineIndex) => (
                <span className="settings-tab-label-line" key={line}>
                  {lineIndex > 0 && <span aria-hidden="true"> </span>}
                  {line}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          aria-labelledby={`settings-tab-${tab.id}`}
          className="settings-tab-panel"
          hidden={activeTab !== tab.id}
          id={`settings-panel-${tab.id}`}
          key={tab.id}
          role="tabpanel"
        >
          {panelContent[tab.id]}
        </div>
      ))}
    </>
  );
}
