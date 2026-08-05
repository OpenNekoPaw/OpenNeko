import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop renderer styles', () => {
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

  it('keeps VS Code-style region controls in PrimarySidebar top chrome rather than Main content', () => {
    expect(styles).toContain("@import '@neko/ui/icons/codicon.css';");
    expect(styles).toMatch(
      /\.primary-sidebar-brand__controls\s*\{[\s\S]*?position\s*:\s*absolute[\s\S]*?top\s*:\s*12px[\s\S]*?right\s*:\s*8px/u,
    );
    expect(styles).toMatch(
      /\.primary-sidebar-brand__controls \.workbench-region-toggle\s*\{[\s\S]*?width\s*:\s*22px[\s\S]*?height\s*:\s*22px[\s\S]*?border\s*:\s*0[\s\S]*?background\s*:\s*transparent/u,
    );
    expect(styles).not.toMatch(
      /\.workbench-region-toggle\[aria-pressed='true'\]\s*\{[^}]*background/u,
    );
    expect(styles).toMatch(
      /\.workbench-region-toggle:active:not\(:disabled\)\s*\{[^}]*background\s*:\s*var\(--neko-desktop-control-pressed\)/u,
    );
    expect(styles).toMatch(/\.workspace-region-controls\s*\{[\s\S]*?display\s*:\s*flex/u);
    expect(styles).toMatch(
      /\.home-navigation--compact \.primary-sidebar-brand__controls\s*\{[\s\S]*?left\s*:\s*90px[\s\S]*?flex-direction\s*:\s*row/u,
    );
    expect(styles).not.toMatch(/\.project-workbench-controls\s*\{/u);
    expect(styles).not.toContain('.project-main-group__actions');
    expect(styles).not.toContain('.project-main-chat-host__controls');
    expect(styles).not.toContain('.project-display-menu');
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

  it('expands Agent-only into the full business area and removes the empty Main column', () => {
    const shellRule = styles.match(
      /\.desktop-scene-workbench--agent-only\.neko-controlled-workbench-shell\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const mainRule = styles.match(
      /\.desktop-scene-workbench--agent-only\s+\.neko-controlled-workbench-main\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(shellRule?.groups?.body).toMatch(
      /grid-template-columns\s*:[\s\S]*?var\(--neko-controlled-primary-width\)[\s\S]*?minmax\(420px, 1fr\)[\s\S]*?0[\s\S]*?0/u,
    );
    expect(mainRule?.groups?.body).toMatch(/display\s*:\s*none/u);
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
    expect(rootRule?.groups?.body).toMatch(/width\s*:\s*min\(1020px, calc\(100% - 64px\)\)/u);
    expect(rootRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(rootRule?.groups?.body).toMatch(/padding\s*:\s*clamp\(66px, 10vh, 104px\) 0 52px/u);
    expect(styles).toMatch(/\.management-surface-list\s*\{[\s\S]*?display\s*:\s*grid/u);
    expect(styles).toMatch(/\.management-surface-row-actions button\s*\{[\s\S]*?width\s*:\s*28px/u);
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
      /\.global-library-browser__loading,[\s\S]*?\.global-library-browser__empty\s*\{[\s\S]*?min-height\s*:\s*160px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading,[\s\S]*?\.global-library-browser__empty\s*\{[\s\S]*?place-items\s*:\s*center/u,
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
