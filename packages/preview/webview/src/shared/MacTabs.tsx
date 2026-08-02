import type { ReactNode } from 'react';
import { Tabs } from '@neko/ui/primitives';

export interface MacTab {
  id: string;
  label?: string;
  icon?: ReactNode;
  title?: string;
}

export interface MacTabsProps {
  tabs: MacTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function MacTabs({ activeTab, className = '', onChange, tabs }: MacTabsProps) {
  return (
    <Tabs
      className={className}
      contentClassName="hidden"
      items={tabs.map((tab) => ({
        value: tab.id,
        label: (
          <span className="inline-flex items-center justify-center gap-1" title={tab.title}>
            {tab.icon ? <span className="h-3.5 w-3.5">{tab.icon}</span> : null}
            {tab.label ? <span>{tab.label}</span> : null}
          </span>
        ),
      }))}
      onValueChange={onChange}
      value={activeTab}
    />
  );
}
