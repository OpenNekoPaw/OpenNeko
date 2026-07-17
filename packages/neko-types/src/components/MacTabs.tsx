/**
 * MacTabs - macOS-style segmented control / tabs
 *
 * Features:
 * - Glass morphism background (neko-tabs-bg CSS class)
 * - Smooth sliding active indicator
 * - Icon + label support
 */

import { type ReactNode } from 'react';

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

export function MacTabs({ tabs, activeTab, onChange, className = '' }: MacTabsProps) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 neko-tabs-bg rounded-neko-md p-0.5 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            title={tab.title}
            className={`
              flex items-center justify-center
              w-8 h-7 rounded-neko-sm
              transition-all duration-200
           ${
             isActive
               ? 'bg-neko-preview-surface text-neko-preview-text-primary shadow-neko-sm'
               : 'bg-transparent text-neko-preview-text-secondary hover:text-neko-preview-text-primary'
           }
     `}
          >
            {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
            {tab.label && <span className="text-xs font-medium">{tab.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
