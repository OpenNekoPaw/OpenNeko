import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop renderer styles', () => {
  it('keeps the pre-React startup diagnostic independent from runtime theme tokens', () => {
    const bootstrapStyles = styles.slice(
      styles.indexOf('.desktop-bootstrap-error'),
      styles.indexOf('\nbutton {'),
    );

    expect(bootstrapStyles).toContain('--desktop-bootstrap-foreground: #1f2328');
    expect(bootstrapStyles).toContain('--desktop-bootstrap-foreground: #f0f3f6');
    expect(bootstrapStyles).toContain('.desktop-bootstrap-error__retry:focus-visible');
    expect(bootstrapStyles).not.toContain('var(--neko-');
  });

  it('scopes package-owned Workbench roots to the pure-white Main surface', () => {
    expect(styles).toMatch(
      /\.desktop-agent-root\s*\{[^}]*--neko-sideBar-background:\s*var\(--neko-desktop-main\)/u,
    );
    expect(styles).toMatch(
      /\.desktop-resource-browser-root\s*\{[^}]*--neko-sideBar-background:\s*var\(--neko-desktop-main\)/u,
    );
  });

  it('keeps the temporary primary-sidebar hover hit region continuous', () => {
    const frameRule = styles.match(
      /\.application-primary-sidebar-frame\s*>\s*\.home-navigation\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(frameRule?.groups?.body).toBeDefined();
    expect(frameRule?.groups?.body).not.toMatch(/transition\s*:[^;]*\bwidth\b/u);
  });

  it('keeps the sidebar interactive outside the dedicated native drag strip', () => {
    const navigationRule = styles.match(/(?:^|\n)\.home-navigation\s*\{(?<body>[\s\S]*?)\n\}/u);
    const dragStripRule = styles.match(/\.home-navigation::before\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(navigationRule?.groups?.body).toMatch(/-webkit-app-region\s*:\s*no-drag/u);
    expect(dragStripRule?.groups?.body).toMatch(/-webkit-app-region\s*:\s*drag/u);
  });

  it('keeps the combined Main and Cut menu compact and keyboard-visible', () => {
    const popoverRule = styles.match(
      /\.workspace-creative-panels-popover\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const itemRule = styles.match(
      /\.workspace-creative-panels-popover__item\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(popoverRule?.groups?.body).toMatch(/width\s*:\s*190px/u);
    expect(itemRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*18px minmax\(0, 1fr\) 18px/u,
    );
    expect(styles).toMatch(
      /\.workspace-creative-panels-popover__item:hover:not\(:disabled\),\s*\n\.workspace-creative-panels-popover__item:focus-visible\s*\{[^}]*background/u,
    );
  });

  it('keeps the Cut add target adjacent to the final tab while allowing tab overflow', () => {
    const tabsRule = styles.match(
      /\.project-cut-panel__tabs \.neko-workbench-editor-tabs\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const addRule = styles.match(/\.project-cut-panel__add\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(tabsRule?.groups?.body).toMatch(/width\s*:\s*max-content/u);
    expect(tabsRule?.groups?.body).toMatch(/max-width\s*:\s*calc\(100% - 32px\)/u);
    expect(tabsRule?.groups?.body).toMatch(/flex\s*:\s*0 1 auto/u);
    expect(tabsRule?.groups?.body).toMatch(/padding-right\s*:\s*2px/u);
    expect(addRule?.groups?.body).toMatch(/width\s*:\s*24px/u);
    expect(addRule?.groups?.body).toMatch(/height\s*:\s*24px/u);
    expect(addRule?.groups?.body).toMatch(/margin\s*:\s*7px 8px 7px 0/u);
  });

  it('reserves stable Project-group columns while actions use the overlay track', () => {
    const projectGroupRule = styles.match(
      /\.primary-conversation-group__header\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(projectGroupRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*24px minmax\(0, 1fr\) auto minmax\(24px, auto\)/u,
    );
  });

  it('uses one typography size for primary navigation directory entries', () => {
    const groupHeadingRule = styles.match(
      /\.primary-conversation-group__standalone-heading\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const expandRule = styles.match(
      /\.primary-conversation-group__expand\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(styles).toMatch(/\.home-project-link\s*\{[^}]*font-size\s*:\s*11px/u);
    expect(groupHeadingRule?.groups?.body).toMatch(/font-size\s*:\s*11px/u);
    expect(expandRule?.groups?.body).toMatch(/font\s*:\s*inherit/u);
    expect(expandRule?.groups?.body).toMatch(/font-size\s*:\s*11px/u);
  });

  it('uses one typography size for primary navigation counts', () => {
    const countRule = styles.match(
      /\.primary-conversation-group__count\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(styles).toMatch(/\.home-sidebar-heading\s*\{[^}]*font-size\s*:\s*10px/u);
    expect(countRule?.groups?.body).toMatch(/font-size\s*:\s*10px/u);
    expect(countRule?.groups?.body).toMatch(/line-height\s*:\s*1\.2/u);
  });

  it('uses icon-only status markers and reveals stable row actions on hover or focus', () => {
    const statusRule = styles.match(/\.home-conversation-status\s*\{(?<body>[\s\S]*?)\n\}/u);
    const unavailableRule = styles.match(
      /\.primary-navigation-unavailable\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const actionsRule = styles.match(/\.primary-navigation-row-actions\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(statusRule?.groups?.body).toMatch(/display\s*:\s*inline-flex/u);
    expect(statusRule?.groups?.body).toMatch(/width\s*:\s*24px/u);
    expect(statusRule?.groups?.body).toMatch(/justify-content\s*:\s*center/u);
    expect(unavailableRule?.groups?.body).toMatch(/width\s*:\s*24px/u);
    expect(unavailableRule?.groups?.body).toMatch(/justify-content\s*:\s*center/u);
    expect(actionsRule?.groups?.body).toMatch(/position\s*:\s*absolute/u);
    expect(actionsRule?.groups?.body).toMatch(/opacity\s*:\s*0/u);
    expect(actionsRule?.groups?.body).toMatch(/pointer-events\s*:\s*none/u);
    expect(styles).toMatch(
      /\.primary-recent-project-row:is\(\s*:hover,\s*:focus-within\s*\)\s*>\s*\.primary-navigation-row-actions\s*\{[\s\S]*?opacity\s*:\s*1/u,
    );
    expect(styles).toMatch(
      /\.primary-recent-project-row:is\(\s*:hover,\s*:focus-within\s*\)\s*>\s*\.primary-navigation-state\s*\{[\s\S]*?opacity\s*:\s*0/u,
    );
    expect(styles).not.toContain('.home-conversation-status__label');
    expect(styles).not.toContain('.primary-navigation-unavailable > span');
  });

  it('centers a bounded Settings control column without centering its text', () => {
    const settingsControlColumnRule = styles.match(
      /\.desktop-settings__navigation-control\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsNavigationButtonRule = styles.match(
      /\.desktop-settings__navigation\s+\.home-nav-button\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsSearchRule = styles.match(
      /\.desktop-settings__navigation-control\s+\.desktop-settings__search\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(settingsControlColumnRule?.groups?.body).toMatch(
      /width\s*:\s*calc\(100%\s*-\s*clamp\(24px,\s*12%,\s*40px\)\)/u,
    );
    expect(settingsControlColumnRule?.groups?.body).not.toMatch(/224px/u);
    expect(settingsControlColumnRule?.groups?.body).toMatch(/margin-inline\s*:\s*auto/u);
    expect(settingsNavigationButtonRule?.groups?.body).toMatch(/text-align\s*:\s*left/u);
    expect(settingsSearchRule?.groups?.body).toMatch(/width\s*:\s*100%/u);
  });

  it('uses a text-only primary brand action without icon chrome', () => {
    const titleRule = styles.match(/\.home-brand-title\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(titleRule?.groups?.body).toMatch(/background\s*:\s*transparent/u);
    expect(titleRule?.groups?.body).toMatch(/border\s*:\s*0/u);
    expect(styles).not.toContain('.home-brand-toggle');
  });

  it('centers the Home Agent launchpad with a constrained-height safety rule', () => {
    const overviewRule = styles.match(/\.home-overview\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(overviewRule?.groups?.body).toMatch(/display\s*:\s*grid/u);
    expect(overviewRule?.groups?.body).toMatch(/place-items\s*:\s*center/u);
    expect(overviewRule?.groups?.body).toMatch(/box-sizing\s*:\s*border-box/u);
    expect(styles).toMatch(
      /@media \(max-height: 720px\)[\s\S]*?\.home-overview\s*\{[\s\S]*?place-items\s*:\s*start center/u,
    );
  });

  it('centers the Agent heading text without a decorative icon tile', () => {
    const headingRule = styles.match(/\.home-launchpad-heading\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(headingRule?.groups?.body).toMatch(/display\s*:\s*grid/u);
    expect(headingRule?.groups?.body).toMatch(/justify-items\s*:\s*center/u);
    expect(headingRule?.groups?.body).toMatch(/text-align\s*:\s*center/u);
    expect(styles).not.toContain('.home-launchpad-heading-icon');
  });

  it('presents the Home Agent handoff as one focused responsive composer', () => {
    const composerRule = styles.match(/\.home-task-composer\s*\{(?<body>[\s\S]*?)\n\}/u);
    const inputRule = styles.match(/\.home-task-composer textarea\s*\{(?<body>[\s\S]*?)\n\}/u);
    const submitRule = styles.match(/\.home-agent-submit\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(composerRule?.groups?.body).toMatch(/display\s*:\s*flex/u);
    expect(composerRule?.groups?.body).toMatch(/flex-direction\s*:\s*column/u);
    expect(composerRule?.groups?.body).not.toMatch(/min-height\s*:\s*176px/u);
    expect(inputRule?.groups?.body).toMatch(/flex\s*:\s*0 0 auto/u);
    expect(inputRule?.groups?.body).toMatch(/resize\s*:\s*none/u);
    expect(inputRule?.groups?.body).toMatch(/field-sizing\s*:\s*content/u);
    expect(inputRule?.groups?.body).toMatch(/overflow-y\s*:\s*auto/u);
    expect(inputRule?.groups?.body).toMatch(/max-height\s*:\s*280px/u);
    expect(submitRule?.groups?.body).toMatch(/border-radius\s*:\s*50%/u);
    expect(submitRule?.groups?.body).toMatch(/background\s*:\s*var\(--neko-desktop-text-strong\)/u);
    expect(styles).toMatch(
      /\.home-agent-submit:disabled\s*\{[\s\S]*?background\s*:\s*var\(--neko-desktop-surface-muted\)/u,
    );
    expect(styles).toMatch(/\.home-task-composer:focus-within\s*\{/u);
    expect(styles).not.toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.home-task-composer\s*\{[\s\S]*?min-height\s*:\s*156px/u,
    );
    expect(styles).not.toContain('.home-open-project-button');
    expect(styles).not.toContain('.home-composer-divider');
  });

  it('overlays Workspace controls on existing Workbench chrome without adding a header row', () => {
    expect(styles).toContain("@import '@neko/ui/icons/codicon.css';");
    expect(styles).toMatch(
      /\.project-workspace > \.neko-controlled-workbench-title\s*\{[\s\S]*?position\s*:\s*absolute[\s\S]*?top\s*:\s*4px[\s\S]*?right\s*:\s*8px[\s\S]*?height\s*:\s*28px/u,
    );
    expect(styles).toMatch(
      /\.neko-controlled-workbench-title \.workbench-region-toggle\s*\{[\s\S]*?width\s*:\s*28px[\s\S]*?height\s*:\s*28px[\s\S]*?border\s*:\s*0[\s\S]*?background\s*:\s*transparent/u,
    );
    expect(styles).toMatch(
      /\.neko-controlled-workbench-title \.workbench-region-toggle\[aria-pressed='true'\]\s*\{[^}]*color\s*:\s*var\(--neko-list-activeSelectionForeground[^}]*background\s*:\s*var\(--neko-list-activeSelectionBackground/u,
    );
    expect(styles).toMatch(
      /\.neko-controlled-workbench-title \.workbench-region-toggle:active:not\(:disabled\)\s*\{[^}]*background\s*:\s*var\(--neko-desktop-control-pressed\)/u,
    );
    expect(styles).toMatch(/\.workspace-region-controls\s*\{[\s\S]*?display\s*:\s*flex/u);
    expect(styles).toMatch(
      /\.workspace-region-controls\s*\{[^}]*-webkit-app-region\s*:\s*no-drag/u,
    );
    expect(styles).not.toMatch(/\.primary-sidebar-brand__controls \.workspace-region-controls/u);
    expect(styles).not.toContain('.desktop-workbench-titlebar');
    expect(styles).not.toMatch(/\.project-workbench-controls\s*\{/u);
    expect(styles).not.toContain('.project-main-group__actions');
    expect(styles).not.toContain('.project-main-chat-host__controls');
    expect(styles).not.toContain('.project-display-menu');
  });

  it('keeps top-level Workbench panels full-bleed beneath native-aligned overlay chrome', () => {
    const mainRule = styles.match(
      /\.project-workspace \.neko-controlled-workbench-main\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const leftDockRule = styles.match(
      /\.project-workspace \.neko-controlled-workbench-dock--left\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const rightDockRule = styles.match(
      /\.project-workspace \.neko-controlled-workbench-dock--right\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const dockedInteractionRule = styles.match(
      /\.project-workspace > \.neko-controlled-workbench-interaction\[data-presentation='docked'\]\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const agentOnlyRule = styles.match(
      /\.desktop-scene-workbench--agent-only > \.neko-controlled-workbench-interaction\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const overlayDockRule = styles.match(
      /\.project-workspace \.neko-controlled-workbench-dock\[data-presentation='overlay'\]\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const dockPanelRule = styles.match(/\.project-dock-panel\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(mainRule?.groups?.body).toMatch(/margin\s*:\s*0/u);
    expect(mainRule?.groups?.body).toMatch(/border-radius\s*:\s*0/u);
    expect(leftDockRule?.groups?.body).toMatch(/padding\s*:\s*0/u);
    expect(rightDockRule?.groups?.body).toMatch(/padding\s*:\s*0/u);
    expect(dockedInteractionRule?.groups?.body).toMatch(/margin\s*:\s*0/u);
    expect(agentOnlyRule?.groups?.body).toMatch(/margin\s*:\s*0/u);
    expect(overlayDockRule?.groups?.body).toMatch(/top\s*:\s*0/u);
    expect(overlayDockRule?.groups?.body).toMatch(/bottom\s*:\s*0/u);
    expect(overlayDockRule?.groups?.body).toMatch(/border-radius\s*:\s*0/u);
    expect(dockPanelRule?.groups?.body).toMatch(/border-radius\s*:\s*0/u);
    expect(styles).toMatch(
      /\.neko-controlled-workbench-main\[data-main-composition='independent-shells'\][\s\S]*?> \.neko-controlled-workbench-main__secondary\s*\{[^}]*border-radius\s*:\s*0/u,
    );
    expect(styles).toMatch(
      /\.neko-controlled-workbench-dock--left\[data-presentation='overlay'\]\s*\{[^}]*left\s*:\s*var\(--neko-controlled-primary-width\)/u,
    );
    expect(styles).toMatch(
      /\.neko-controlled-workbench-dock--right\[data-presentation='overlay'\]\s*\{[^}]*right\s*:\s*0/u,
    );
    expect(styles).not.toMatch(
      /\.project-workspace\[data-left-presentation='docked'\] \.neko-controlled-workbench-main/u,
    );
    expect(styles).toMatch(
      /@media \(max-width: 1120px\)[\s\S]*?\.neko-controlled-workbench-dock\[data-presentation='docked'\]\s*\{[^}]*top\s*:\s*0[^}]*bottom\s*:\s*0[^}]*border-radius\s*:\s*0/u,
    );
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.neko-controlled-workbench-main\s*\{[^}]*margin\s*:\s*0[^}]*border-radius\s*:\s*0/u,
    );
  });

  it('aligns Workspace Main tabs with the adjacent resource header', () => {
    const workspaceRule = styles.match(
      /\.project-workspace\.neko-controlled-workbench-shell\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const mainHeaderRule = styles.match(/\.project-main-group__tabs\s*\{(?<body>[\s\S]*?)\n\}/u);
    const mainTabsRule = styles.match(
      /\.project-main-group__tabs \.neko-workbench-editor-tabs\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const resourceDockRule = styles.match(/\.project-resource-dock\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(workspaceRule?.groups?.body).toMatch(
      /--neko-desktop-workbench-panel-header-height\s*:\s*38px/u,
    );
    expect(mainHeaderRule?.groups?.body).toMatch(
      /height\s*:\s*var\(--neko-desktop-workbench-panel-header-height\)/u,
    );
    expect(mainTabsRule?.groups?.body).toMatch(
      /height\s*:\s*var\(--neko-desktop-workbench-panel-header-height\)/u,
    );
    expect(mainTabsRule?.groups?.body).toMatch(/padding-block\s*:\s*4px/u);
    expect(styles).toMatch(
      /\.project-workspace\[data-right-presentation='hidden'\] \.project-main-group__tabs,[\s\S]*?\.project-workspace\[data-right-presentation='overlay'\] \.project-main-group__tabs\s*\{[^}]*padding-right\s*:\s*132px/u,
    );
    expect(resourceDockRule?.groups?.body).toMatch(
      /grid-template-rows\s*:\s*var\(--neko-desktop-workbench-panel-header-height\) minmax\(0, 1fr\)/u,
    );
  });

  it('projects opaque shared Popover tokens for Desktop portals', () => {
    expect(styles).toMatch(/--neko-popover-background\s*:\s*var\(--neko-desktop-surface-raised\)/u);
    expect(styles).toMatch(/--neko-popover-border\s*:\s*var\(--neko-desktop-border-strong\)/u);
    expect(styles).toMatch(/--neko-popover-foreground\s*:\s*var\(--neko-fg\)/u);
  });

  it('gives the package-owned Asset Management Root its complete Workbench viewport', () => {
    const globalLibraryRootRule = styles.match(
      /\.desktop-asset-management-root\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(globalLibraryRootRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(globalLibraryRootRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
  });

  it('keeps structural Workbench frames neutral at their top and bottom edges', () => {
    const mainRule = styles.match(
      /\.project-workspace \.neko-controlled-workbench-main\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const independentMainRule = styles.match(
      /> \.neko-controlled-workbench-main__secondary\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const dockPanelRule = styles.match(/\.project-dock-panel\s*\{(?<body>[\s\S]*?)\n\}/u);

    for (const rule of [mainRule, independentMainRule, dockPanelRule]) {
      expect(rule?.groups?.body).toMatch(/box-shadow\s*:\s*none/u);
      expect(rule?.groups?.body).not.toMatch(/--neko-desktop-shadow-surface/u);
    }
    expect(styles).not.toContain('.project-workspace .neko-controlled-workbench-timeline');
    expect(dockPanelRule?.groups?.body).toMatch(
      /border\s*:\s*1px solid var\(--neko-desktop-border\)/u,
    );
  });

  it('expands Agent-only interaction into the business area and collapses both docks', () => {
    const shellRule = styles.match(
      /\.desktop-scene-workbench--agent-only\.neko-controlled-workbench-shell\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const dockedInteractionRule = styles.match(
      /\.project-workspace > \.neko-controlled-workbench-interaction\[data-presentation='docked'\]\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const interactionRule = styles.match(
      /\.desktop-scene-workbench--agent-only > \.neko-controlled-workbench-interaction\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(shellRule?.groups?.body).toMatch(
      /grid-template-columns\s*:[\s\S]*?var\(--neko-controlled-primary-width\)[\s\S]*?0[\s\S]*?minmax\(420px, 1fr\)[\s\S]*?0/u,
    );
    expect(dockedInteractionRule?.groups?.body).toMatch(/margin\s*:\s*0/u);
    expect(interactionRule?.groups?.body).toMatch(/margin\s*:\s*0/u);
  });

  it('gives the package-owned Preview Root its complete Workbench viewport', () => {
    const previewSurfaceRule = styles.match(/\.desktop-preview-surface\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(previewSurfaceRule?.groups?.body).toMatch(/width\s*:\s*100%/u);
    expect(previewSurfaceRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(previewSurfaceRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
    expect(previewSurfaceRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
  });

  it('keeps Asset names visible in a compact management panel', () => {
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\][\s\S]*?\.global-library-browser__collection\[data-view-mode='list'\][\s\S]*?\.global-library-browser__entry\s*\{[\s\S]*?grid-template-columns\s*:\s*40px minmax\(0, 1fr\) 28px/u,
    );
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\]\s+\.global-library-browser__size\s*\{[\s\S]*?display\s*:\s*none/u,
    );
  });

  it('styles owner-qualified management Roots without superseded Home management selectors', () => {
    const rootRule = styles.match(
      /\.agent-extension-management-root,[\s\S]*?\.project-management-catalog\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const managementListRule = styles.match(/\.management-surface-list\s*\{(?<body>[\s\S]*?)\n\}/u);
    const projectRootRule = styles.match(
      /\.project-management-catalog\s*\{\n(?<body>\s+height\s*:\s*100%;[\s\S]*?)\n\}/u,
    );
    const projectListRule = styles.match(
      /\.project-management-catalog\s*>\s*\.management-surface-list\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    expect(rootRule?.groups?.body).toMatch(/width\s*:\s*min\(1020px, calc\(100% - 64px\)\)/u);
    expect(rootRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(rootRule?.groups?.body).toMatch(/padding\s*:\s*clamp\(66px, 10vh, 104px\) 0 52px/u);
    expect(styles).toMatch(/\.management-surface-list\s*\{[\s\S]*?display\s*:\s*grid/u);
    expect(managementListRule?.groups?.body).toMatch(/padding\s*:\s*0/u);
    expect(managementListRule?.groups?.body).not.toMatch(/border|background|border-radius/u);
    expect(projectRootRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(projectRootRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
    expect(projectRootRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
    expect(projectListRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
    expect(projectListRule?.groups?.body).toMatch(/flex\s*:\s*1 1 auto/u);
    expect(projectListRule?.groups?.body).toMatch(/align-content\s*:\s*start/u);
    expect(projectListRule?.groups?.body).toMatch(/overflow-y\s*:\s*auto/u);
    expect(styles).toMatch(
      /\.project-management-catalog\s*>\s*\.management-surface-header,[\s\S]*?\.project-management-catalog\s*>\s*\.management-surface-toolbar\s*\{[\s\S]*?flex\s*:\s*0 0 auto/u,
    );
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-role='management'\]\s*>\s*\.project-main-group__content\s*\{[\s\S]*?height\s*:\s*100%/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\[data-empty='true'\]\s*\{[\s\S]*?display\s*:\s*grid[\s\S]*?grid-template-columns\s*:\s*minmax\(0, 1fr\)[\s\S]*?flex\s*:\s*1/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\.is-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*repeat\(auto-fill, minmax\(260px, 1fr\)\)/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\.is-grid \.management-surface-row\s*\{[\s\S]*?min-height\s*:\s*132px[\s\S]*?flex-direction\s*:\s*column/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-surface-row__select\[data-selected='true'\]\s*\{[^}]*border-color[^}]*background/u,
    );
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\] \.management-surface-list\.is-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*1fr/u,
    );
    expect(styles).toMatch(
      /\.management-surface-row__open:focus-visible,[\s\S]*?\.management-surface-row-actions button:focus-visible\s*\{[\s\S]*?outline\s*:\s*2px/u,
    );
    expect(styles).toMatch(/\.management-surface-row-actions button\s*\{[\s\S]*?width\s*:\s*28px/u);
    expect(styles).not.toMatch(
      /\.management-surface-list\.is-grid \.management-surface-row-actions\s*\{[^}]*border-top/u,
    );
    expect(styles).not.toMatch(/\.project-management-batch-toolbar/u);
    expect(styles).not.toMatch(/\.management-surface-row\[data-selected='true'\]/u);
    expect(styles).not.toMatch(/\.management-surface-empty/u);
    expect(styles).not.toMatch(/\.project-management-detail(?:__content)?\s*\{/u);
    expect(styles).not.toMatch(
      /\.home-(?:management|project-(?:selector|list|grid|card)|sort-control|search-field|segmented-control|status-badge)/u,
    );
  });

  it('keeps the Global Library as an aligned unframed workbench surface', () => {
    const packageStyles = readFileSync(
      new URL('../../../packages/assets/webview/src/global-library/style.css', import.meta.url),
      'utf8',
    );
    const browserRule = packageStyles.match(/\.global-library-browser\s*\{(?<body>[\s\S]*?)\n\}/u);
    const headerRule = packageStyles.match(
      /\.global-library-browser__header\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const headingRule = packageStyles.match(
      /\.global-library-browser__header h1\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(browserRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(browserRule?.groups?.body).toMatch(/width\s*:\s*min\(1020px, calc\(100% - 64px\)\)/u);
    expect(browserRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(browserRule?.groups?.body).not.toMatch(/border-radius/u);
    expect(headerRule?.groups?.body).toMatch(/align-items\s*:\s*flex-end/u);
    expect(headerRule?.groups?.body).toMatch(/margin-bottom\s*:\s*22px/u);
    expect(headingRule?.groups?.body).toMatch(/font-size\s*:\s*27px/u);
    expect(packageStyles).toMatch(
      /\.global-library-browser__toolbar\s*\{[\s\S]*?margin-bottom\s*:\s*16px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__commands button,[\s\S]*?min-height\s*:\s*36px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__collection\s*\{[\s\S]*?padding\s*:\s*10px 0 0/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__search\s*\{[\s\S]*?width\s*:\s*min\(420px, 55%\)/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading\s*\{[\s\S]*?min-height\s*:\s*160px/u,
    );
    expect(packageStyles).not.toMatch(/\.global-library-browser__empty/u);
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading\s*\{[\s\S]*?place-items\s*:\s*center/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__toolbar\s*>\s*button\s*\{[\s\S]*?width\s*:\s*36px[\s\S]*?min-width\s*:\s*36px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__commands button\s*\{[\s\S]*?background\s*:\s*var\(--neko-accent/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser button\[aria-pressed='true'\]\s*\{[\s\S]*?var\(--neko-list-activeSelectionBackground/u,
    );
    expect(packageStyles).not.toMatch(
      /var\(--neko-(?:text-(?:primary|secondary|tertiary)|surface-(?:subtle|muted)|border-strong)/u,
    );
  });
});
