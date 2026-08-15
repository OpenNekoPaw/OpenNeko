import { FolderIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useState, type ReactNode } from 'react';

export type DesktopWorkspaceProjectBrowserView = 'resources' | 'workspace';

export function DesktopWorkspaceProjectBrowser({
  locale,
  resources,
  workspace,
}: {
  readonly locale: SupportedLocale;
  readonly resources: ReactNode;
  readonly workspace: ReactNode;
}): JSX.Element {
  const [view, setView] = useState<DesktopWorkspaceProjectBrowserView>('resources');
  const label = locale === 'zh-cn' ? '项目浏览器' : 'Project browser';

  const panelId =
    view === 'resources'
      ? 'workspace-project-browser-resources'
      : 'workspace-project-browser-workspace';
  return (
    <section className="project-resource-dock" data-project-browser-view={view}>
      <header className="project-resource-dock__header">
        <span>
          <FolderIcon size={15} />
          <strong>{label}</strong>
        </span>
      </header>
      <div
        className="project-resource-dock__views"
        aria-label={label}
        role="tablist"
      >
        <button
          aria-controls="workspace-project-browser-resources"
          aria-selected={view === 'resources'}
          id="workspace-project-browser-resources-tab"
          onClick={() => setView('resources')}
          role="tab"
          type="button"
        >
          {locale === 'zh-cn' ? '资源' : 'Resources'}
        </button>
        <button
          aria-controls="workspace-project-browser-workspace"
          aria-selected={view === 'workspace'}
          id="workspace-project-browser-workspace-tab"
          onClick={() => setView('workspace')}
          role="tab"
          type="button"
        >
          {locale === 'zh-cn' ? '创作' : 'Creation'}
        </button>
      </div>
      <div
        aria-labelledby={`${panelId}-tab`}
        className="project-resource-dock__content"
        id={panelId}
        role="tabpanel"
      >
        {view === 'resources' ? resources : workspace}
      </div>
    </section>
  );
}
