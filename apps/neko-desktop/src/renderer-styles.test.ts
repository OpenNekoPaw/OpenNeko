import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop renderer styles', () => {
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

  it('hides the visibility control on the idle compact rail and reveals it with the sidebar', () => {
    expect(styles).toMatch(
      /\.home-navigation--compact\s+\.home-brand-toggle\s*\{[\s\S]*?display\s*:\s*none/u,
    );
    expect(styles).toMatch(
      /data-primary-sidebar-hover-reveal='true'[\s\S]*?:is\(\s*:hover,\s*:focus-within\s*\)[\s\S]*?\.home-brand-toggle\s*\{[\s\S]*?display\s*:\s*inline-flex/u,
    );
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

  it('keeps project layout controls in the primary-sidebar footer rather than over Main content', () => {
    expect(styles).toMatch(/\.home-navigation-footer__actions\s*\{[\s\S]*?display\s*:\s*flex/u);
    expect(styles).toMatch(
      /\.home-navigation--compact\s+\.home-navigation-footer__actions\s*\{[\s\S]*?flex-direction\s*:\s*column/u,
    );
    expect(styles).not.toMatch(/\.project-workbench-controls\s*\{/u);
  });

  it('projects opaque shared Popover tokens for Desktop portals', () => {
    expect(styles).toMatch(/--neko-popover-background\s*:\s*var\(--neko-desktop-surface-raised\)/u);
    expect(styles).toMatch(/--neko-popover-border\s*:\s*var\(--neko-desktop-border-strong\)/u);
    expect(styles).toMatch(/--neko-popover-foreground\s*:\s*var\(--neko-fg\)/u);
  });

  it('gives the package-owned Global Library its complete Home viewport', () => {
    const globalLibraryRootRule = styles.match(
      /\.desktop-global-library-root\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(globalLibraryRootRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(globalLibraryRootRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
  });

  it('keeps the Global Library as a compact unframed workbench surface', () => {
    const packageStyles = readFileSync(
      new URL('../../../packages/neko-assets/src/global-library/style.css', import.meta.url),
      'utf8',
    );
    const browserRule = packageStyles.match(
      /\.global-library-browser\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const headerRule = packageStyles.match(
      /\.global-library-browser__header\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const headingRule = packageStyles.match(
      /\.global-library-browser__header h1\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(browserRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(browserRule?.groups?.body).not.toMatch(/border-radius/u);
    expect(headerRule?.groups?.body).toMatch(/padding\s*:\s*16px 16px 10px/u);
    expect(headingRule?.groups?.body).toMatch(/font-size\s*:\s*16px/u);
    expect(packageStyles).toMatch(
      /\.global-library-browser__toolbar\s*\{[\s\S]*?padding\s*:\s*0 16px 10px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__commands button,[\s\S]*?min-height\s*:\s*28px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__collection\s*\{[\s\S]*?padding\s*:\s*10px 16px 16px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__search\s*\{[\s\S]*?max-width\s*:\s*760px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading,[\s\S]*?\.global-library-browser__empty\s*\{[\s\S]*?flex\s*:\s*1/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading,[\s\S]*?\.global-library-browser__empty\s*\{[\s\S]*?place-items\s*:\s*center/u,
    );
  });
});
