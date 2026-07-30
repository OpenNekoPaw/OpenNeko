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
    expect(submitRule?.groups?.body).toMatch(
      /background\s*:\s*var\(--neko-desktop-text-strong\)/u,
    );
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
});
