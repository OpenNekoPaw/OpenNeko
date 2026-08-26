import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop renderer styles', () => {
  it('stacks Character conversation context directly after participant details', () => {
    const managerRule = styles.match(/\.character-workbench-manager\s*\{(?<body>[\s\S]*?)\n\}/u);
    const participantRule = styles.match(
      /\.character-workbench-manager > \.character-participant-manager\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const continuityRule = styles.match(
      /\.character-companion-continuity\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(managerRule?.groups?.body).toMatch(/display\s*:\s*flex/u);
    expect(managerRule?.groups?.body).toMatch(/flex-direction\s*:\s*column/u);
    expect(managerRule?.groups?.body).toMatch(/overflow-y\s*:\s*auto/u);
    expect(participantRule?.groups?.body).toMatch(/height\s*:\s*auto/u);
    expect(participantRule?.groups?.body).toMatch(/flex\s*:\s*0 0 auto/u);
    expect(continuityRule?.groups?.body).toMatch(/max-height\s*:\s*none/u);
    expect(continuityRule?.groups?.body).toMatch(/flex\s*:\s*0 0 auto/u);
  });

  it('keeps authoring surfaces constrained', () => {
    expect(styles).toMatch(
      /\.project-authoring-target-switch,[\s\S]*?min-width:\s*0;[\s\S]*?min-height:\s*0;/u,
    );
  });
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

  it('gives the Skill/MCP catalog quiet cards with a stable heading hierarchy', () => {
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row\s*\{[^}]*background:\s*var\(--neko-desktop-surface-raised\)/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row__heading\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) 22px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row__summary\s*\{[^}]*-webkit-line-clamp:\s*2/u,
    );
    expect(styles).toMatch(
      /\.extension-management-mode-switcher button\[aria-selected='true'\]\s*\{[^}]*background:\s*var\(--neko-button-background\)/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.agent-extension-catalog-row\[data-selected='true'\]\s*\{[^}]*border-color:[^}]*background:[^}]*box-shadow:/u,
    );
    expect(styles).toMatch(
      /\.professional-application-management-root \.professional-application-row\[data-selected='true'\]\s*\{[^}]*border-color:[^}]*background:[^}]*box-shadow:/u,
    );
    expect(styles).not.toContain('.extension-catalog-scope-filter');
    expect(styles).toMatch(
      /\.extension-detail-overlay\s*\{[^}]*width:\s*min\(760px,[^}]*max-height:[^}]*overflow:\s*hidden/u,
    );
    expect(styles).toMatch(
      /\[role='dialog'\]\.agent-extension-detail-overlay\s*\{[^}]*width:\s*min\(560px,/u,
    );
    expect(styles).toMatch(
      /\[role='dialog'\]\.professional-application-detail-overlay\s*\{[^}]*width:\s*min\(760px,/u,
    );
  });

  it('aligns embedded Project Content with the compact Resource Browser list language', () => {
    const groupsRule = styles.match(
      /\.project-content-root\.is-embedded \.project-content-groups\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const rowRule = styles.match(
      /\.project-content-root\.is-embedded \.project-content-row\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const iconRule = styles.match(
      /\.project-content-root\.is-embedded \.project-content-row-icon\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const emptyRule = styles.match(
      /\.project-content-root\.is-embedded \.project-content-empty\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const embeddedRootRule = styles.match(
      /\.project-content-root\.is-embedded\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(groupsRule?.groups?.body).toMatch(/display\s*:\s*block/u);
    expect(groupsRule?.groups?.body).toMatch(/padding\s*:\s*4px 5px 16px/u);
    expect(rowRule?.groups?.body).toMatch(/min-height\s*:\s*32px/u);
    expect(rowRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*24px minmax\(0, 1fr\) auto/u,
    );
    expect(rowRule?.groups?.body).toMatch(/border-radius\s*:\s*6px/u);
    expect(iconRule?.groups?.body).toMatch(/width\s*:\s*24px/u);
    expect(iconRule?.groups?.body).toMatch(/height\s*:\s*24px/u);
    expect(emptyRule?.groups?.body).toMatch(/font-size\s*:\s*9px/u);
    expect(embeddedRootRule?.groups?.body).toMatch(/background\s*:\s*transparent/u);
    expect(styles).toMatch(/\.project-content-row\s*\{[^}]*min-height\s*:\s*76px/u);
  });

  it('uses a strong underline instead of a filled background for Project Browser modes', () => {
    const modesRule = styles.match(/\.project-resource-dock__views\s*\{(?<body>[\s\S]*?)\n\}/u);
    const buttonRule = styles.match(
      /\.project-resource-dock__views button\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const selectedRule = styles.match(
      /\.project-resource-dock__views button\[aria-selected='true'\]\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(modesRule?.groups?.body).toMatch(/background\s*:\s*transparent/u);
    expect(buttonRule?.groups?.body).toMatch(/border-bottom\s*:\s*2px solid transparent/u);
    expect(selectedRule?.groups?.body).toMatch(
      /border-bottom-color\s*:\s*var\(--neko-focus-border\)/u,
    );
    expect(selectedRule?.groups?.body).toMatch(/background\s*:\s*transparent/u);
    expect(selectedRule?.groups?.body).toMatch(/font-weight\s*:\s*650/u);
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

  it('keeps bounded Project template cards inside the shared management content width', () => {
    const catalogRule = styles.match(/\.creative-library-catalog\s*\{(?<body>[\s\S]*?)\n\}/u);
    const gridRule = styles.match(/\.project-template-grid\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(catalogRule?.groups?.body).toMatch(/width\s*:\s*min\(1118px, calc\(100% - 72px\)\)/u);
    expect(catalogRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(gridRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*repeat\(auto-fit, minmax\(min\(236px, 100%\), 280px\)\)/u,
    );
    expect(gridRule?.groups?.body).toMatch(/justify-content\s*:\s*start/u);
    expect(styles).not.toContain('.creative-template-card');
  });

  it('aligns Works with the shared management hierarchy and compact search', () => {
    const catalogRule = styles.match(/\.creative-library-catalog\s*\{(?<body>[\s\S]*?)\n\}/u);
    const contentRule = styles.match(
      /\.creative-library-catalog__content\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const heroRule = styles.match(/\.creative-library-catalog__hero\s*\{(?<body>[\s\S]*?)\n\}/u);
    const searchRule = styles.match(
      /\.creative-library-catalog__search\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const emptyRule = styles.match(/\.creative-library-catalog__empty\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(catalogRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(catalogRule?.groups?.body).toMatch(/padding\s*:\s*clamp\(48px, 7vh, 76px\) 0 48px/u);
    expect(catalogRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
    expect(contentRule?.groups?.body).toMatch(/gap\s*:\s*36px/u);
    expect(contentRule?.groups?.body).toMatch(/overflow-y\s*:\s*auto/u);
    expect(heroRule?.groups?.body).toMatch(/display\s*:\s*flex/u);
    expect(heroRule?.groups?.body).toMatch(/min-height\s*:\s*184px/u);
    expect(styles).toMatch(
      /\.creative-library-catalog__hero-visual\s*\{[^}]*width\s*:\s*clamp\(300px, 40%, 420px\)[^}]*height\s*:\s*152px/u,
    );
    expect(styles).toMatch(
      /\.creative-library-catalog__hero-visual::after\s*\{[^}]*width\s*:\s*92px[^}]*height\s*:\s*58px/u,
    );
    expect(styles).toMatch(
      /\.creative-library-catalog__hero-tile\s*\{[^}]*width\s*:\s*54px[^}]*height\s*:\s*54px/u,
    );
    expect(searchRule?.groups?.body).toMatch(/width\s*:\s*clamp\(220px, 24vw, 288px\)/u);
    expect(searchRule?.groups?.body).toMatch(/min-height\s*:\s*36px/u);
    expect(searchRule?.groups?.body).toMatch(/flex\s*:\s*0 1 288px/u);
    expect(emptyRule?.groups?.body).toMatch(/min-height\s*:\s*236px/u);
    expect(styles).toMatch(
      /@media \(max-width: 560px\)\s*\{[\s\S]*?\.creative-library-catalog__hero-visual\s*\{[^}]*display\s*:\s*none/u,
    );
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

  it('presents Settings as a Window-adaptive two-column overlay with left-aligned navigation', () => {
    const settingsOverlayRule = styles.match(
      /\[role='dialog'\]\.desktop-settings-overlay\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsLayoutRule = styles.match(
      /\.desktop-settings-overlay__layout\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsSemanticHeaderRule = styles.match(
      /\.desktop-settings-overlay > div:first-child\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsNavigationButtonRule = styles.match(
      /\.desktop-settings__navigation\s+\.home-nav-button\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsSearchRule = styles.match(
      /\.desktop-settings__navigation\s+\.desktop-settings__search\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const settingsCardRule = styles.match(/\.desktop-settings__card\s*\{(?<body>[\s\S]*?)\n\}/u);
    const settingsRowRule = styles.match(/\.desktop-settings__row\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(settingsOverlayRule?.groups?.body).toMatch(
      /--desktop-settings-overlay-inset\s*:\s*clamp\(16px, 3vmin, 40px\)/u,
    );
    expect(settingsOverlayRule?.groups?.body).toMatch(/width\s*:\s*min\(\s*1440px,/u);
    expect(settingsOverlayRule?.groups?.body).toMatch(/height\s*:\s*min\(\s*960px,/u);
    expect(settingsOverlayRule?.groups?.body).toMatch(
      /max-width\s*:\s*calc\(\s*100vw - var\(--desktop-settings-overlay-inset\)/u,
    );
    expect(settingsOverlayRule?.groups?.body).toMatch(
      /max-height\s*:\s*calc\(\s*100vh - var\(--desktop-settings-overlay-inset\)/u,
    );
    expect(settingsOverlayRule?.groups?.body).toMatch(/grid-template-rows\s*:\s*minmax\(0, 1fr\)/u);
    expect(settingsSemanticHeaderRule?.groups?.body).toMatch(/position\s*:\s*absolute/u);
    expect(settingsSemanticHeaderRule?.groups?.body).toMatch(/width\s*:\s*1px/u);
    expect(settingsSemanticHeaderRule?.groups?.body).toMatch(/clip-path\s*:\s*inset\(50%\)/u);
    expect(settingsSemanticHeaderRule?.groups?.body).not.toMatch(/border-bottom/u);
    expect(settingsLayoutRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*240px minmax\(0, 1fr\)/u,
    );
    expect(styles).toMatch(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\[role='dialog'\]\.desktop-settings-overlay\s*\{[\s\S]*?--desktop-settings-overlay-inset\s*:\s*12px/u,
    );
    expect(settingsNavigationButtonRule?.groups?.body).toMatch(/text-align\s*:\s*left/u);
    expect(settingsSearchRule?.groups?.body).toMatch(/width\s*:\s*100%/u);
    expect(settingsSearchRule?.groups?.body).toMatch(/height\s*:\s*36px/u);
    expect(settingsSearchRule?.groups?.body).toMatch(/flex\s*:\s*0 0 36px/u);
    expect(settingsCardRule?.groups?.body).toMatch(/border-radius\s*:\s*10px/u);
    expect(settingsCardRule?.groups?.body).toMatch(/box-shadow\s*:\s*none/u);
    expect(settingsRowRule?.groups?.body).toMatch(/min-height\s*:\s*64px/u);
    expect(styles).toMatch(
      /\.desktop-settings__content\s*\{[^}]*container\s*:\s*desktop-settings-content \/ inline-size/u,
    );
    expect(styles).toMatch(
      /@container desktop-settings-content \(max-width: 620px\)\s*\{[\s\S]*?\.desktop-settings__row\s*\{[\s\S]*?flex-direction\s*:\s*column/u,
    );
  });

  it('groups settings providers in two columns with a narrow single-column override', () => {
    expect(styles).toMatch(
      /\.desktop-settings__provider-groups\s*\{[\s\S]*?grid-template-columns\s*:\s*repeat\(2, minmax\(0, 1fr\)\)/u,
    );
    expect(styles).toMatch(
      /@container desktop-settings-content \(max-width: 620px\)\s*\{[\s\S]*?\.desktop-settings__provider-groups,[\s\S]*?grid-template-columns\s*:\s*1fr/u,
    );
  });

  it('stretches the Settings overlay layout through the Dialog body', () => {
    expect(styles).toMatch(/\.desktop-settings-overlay__layout\s*\{[^}]*height\s*:\s*100%/u);
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
    const mainCreateRule = styles.match(
      /\.workspace-main-quick-create__tab-trigger\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const mainContextActionsRule = styles.match(
      /\.project-main-group__context-actions\s*\{(?<body>[\s\S]*?)\n\}/u,
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
    expect(mainTabsRule?.groups?.body).toMatch(/width\s*:\s*max-content/u);
    expect(mainTabsRule?.groups?.body).toMatch(/max-width\s*:\s*calc\(100% - 32px\)/u);
    expect(mainTabsRule?.groups?.body).toMatch(/flex\s*:\s*0 1 auto/u);
    expect(mainTabsRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
    expect(mainCreateRule?.groups?.body).toMatch(/width\s*:\s*24px/u);
    expect(mainCreateRule?.groups?.body).toMatch(/height\s*:\s*24px/u);
    expect(mainContextActionsRule?.groups?.body).toMatch(/flex\s*:\s*0 0 auto/u);
    expect(mainContextActionsRule?.groups?.body).toMatch(/margin-left\s*:\s*auto/u);
    expect(mainContextActionsRule?.groups?.body).toMatch(
      /background\s*:\s*var\(--neko-desktop-chrome\)/u,
    );
    expect(styles).toMatch(
      /\.project-workspace\[data-right-presentation='hidden'\] \.project-main-group__tabs,[\s\S]*?\.project-workspace\[data-right-presentation='overlay'\] \.project-main-group__tabs\s*\{[^}]*padding-right\s*:\s*132px/u,
    );
    expect(resourceDockRule?.groups?.body).toMatch(
      /grid-template-rows\s*:\s*var\(--neko-desktop-workbench-panel-header-height\) 34px minmax\(0, 1fr\)/u,
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

  it('lets the package-owned Asset container keep names visible at narrow widths', () => {
    const packageStyles = readFileSync(
      new URL('../../../packages/assets/webview/src/global-library/style.css', import.meta.url),
      'utf8',
    );

    expect(styles).not.toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\][\s\S]*?\.global-library-browser/u,
    );
    expect(packageStyles).toMatch(
      /@container \(max-width: 700px\)[\s\S]*?\.global-library-browser__collection\[data-view-mode='list'\] \.global-library-browser__entry\s*\{[^}]*grid-template-columns\s*:\s*40px minmax\(0, 1fr\) 28px/u,
    );
    expect(packageStyles).toMatch(
      /@container \(max-width: 700px\)[\s\S]*?\.global-library-browser__size\s*\{[^}]*display\s*:\s*none/u,
    );
  });

  it('styles owner-qualified management Roots without superseded Home management selectors', () => {
    const rootRule = styles.match(
      /\.agent-extension-management-root,[\s\S]*?\.project-management-catalog\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const extensionRootRule = styles.match(
      /\.agent-extension-management-root,\s*\.professional-application-management-root\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const desktopExtensionRootRule = styles.match(
      /\.desktop-extension-management-composition\s*>\s*\.agent-extension-management-root,\s*\.desktop-extension-management-composition\s*>\s*\.professional-application-management-root\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const managementListRule = styles.match(/\.management-surface-list\s*\{(?<body>[\s\S]*?)\n\}/u);
    const projectRootRule = styles.match(
      /\.project-management-catalog\s*\{\n(?<body>\s+height\s*:\s*100%;[\s\S]*?)\n\}/u,
    );
    const projectListRule = styles.match(
      /\.project-catalog-collection \.management-surface-list\.is-grid\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const projectContentRule = styles.match(
      /\.project-management-catalog__content\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const agentCardHoverRule = styles.match(
      /\.agent-extension-management-root \.agent-extension-catalog-row:hover\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const professionalCardHoverRule = styles.match(
      /\.professional-application-management-root \.professional-application-row:hover\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const searchFieldRule = styles.match(
      /(?:^|\n)\.management-search-field\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    expect(rootRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(extensionRootRule?.groups?.body).toMatch(
      /width\s*:\s*min\(1118px, calc\(100% - 72px\)\)/u,
    );
    expect(extensionRootRule?.groups?.body).toMatch(
      /padding\s*:\s*clamp\(48px, 7vh, 76px\) 0 48px/u,
    );
    expect(desktopExtensionRootRule?.groups?.body).toMatch(/height\s*:\s*auto/u);
    expect(desktopExtensionRootRule?.groups?.body).toMatch(/flex\s*:\s*1 1 auto/u);
    expect(desktopExtensionRootRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
    expect(desktopExtensionRootRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
    expect(desktopExtensionRootRule?.groups?.body).not.toMatch(/\b(?:width|margin|padding)\s*:/u);
    expect(styles).toMatch(
      /\.agent-extension-management-root,\s*\.professional-application-management-root,\s*\.project-management-catalog\s*\{/u,
    );
    expect(styles).toMatch(
      /\.project-management-catalog\s*\{[\s\S]*?width\s*:\s*min\(1118px, calc\(100% - 72px\)\)[\s\S]*?padding\s*:\s*clamp\(48px, 7vh, 76px\) 0 48px/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-surface-list\.is-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fill, 214px\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root > \.management-surface-header,[\s\S]*?\.professional-application-management-root > \.management-surface-toolbar\s*\{[^}]*width:\s*100%/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root > \.management-surface-list,[\s\S]*?\.professional-application-management-root > \.management-surface-list\s*\{[^}]*width:\s*100%/u,
    );
    expect(styles).toMatch(
      /\.professional-application-management-root \.management-surface-list\.is-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fill, 214px\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(styles).toMatch(
      /\.agent-extension-management-root[\s\S]*?\.management-surface-list\.is-grid[\s\S]*?\.agent-extension-catalog-row\s*\{[^}]*min-height:\s*120px/u,
    );
    expect(styles).toMatch(
      /\.professional-application-management-root[\s\S]*?\.management-surface-list\.is-grid[\s\S]*?\.professional-application-row\s*\{[^}]*min-height:\s*120px/u,
    );
    expect(styles).toMatch(
      /\.desktop-extension-management-composition\s*\{[^}]*container\s*:\s*extension-management \/ inline-size/u,
    );
    expect(styles).toMatch(
      /@container extension-management \(max-width: 820px\)\s*\{[\s\S]*?\.agent-extension-management-root,[\s\S]*?width\s*:\s*calc\(100% - 32px\)/u,
    );
    expect(searchFieldRule?.groups?.body).toMatch(/width\s*:\s*auto/u);
    expect(searchFieldRule?.groups?.body).toMatch(/flex\s*:\s*1 1 320px/u);
    expect(styles).toMatch(
      /\.agent-extension-management-root \.management-search-field,\s*\.professional-application-management-root \.management-search-field\s*\{[^}]*width\s*:\s*auto[^}]*max-width\s*:\s*none[^}]*min-width\s*:\s*12rem[^}]*min-height\s*:\s*36px[^}]*flex\s*:\s*1 1 24rem/u,
    );
    expect(styles).toMatch(
      /@container extension-management \(max-width: 820px\)\s*\{[\s\S]*?\.agent-extension-management-root \.management-search-field,[\s\S]*?width\s*:\s*100%[\s\S]*?flex-basis\s*:\s*100%/u,
    );
    expect(agentCardHoverRule?.groups?.body).not.toMatch(/transform/u);
    expect(professionalCardHoverRule?.groups?.body).not.toMatch(/transform/u);
    expect(styles).toMatch(/\.management-surface-list\s*\{[\s\S]*?display\s*:\s*grid/u);
    expect(managementListRule?.groups?.body).toMatch(/padding\s*:\s*0/u);
    expect(managementListRule?.groups?.body).not.toMatch(/border|background|border-radius/u);
    expect(projectRootRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(projectRootRule?.groups?.body).toMatch(/min-height\s*:\s*0/u);
    expect(projectRootRule?.groups?.body).toMatch(/overflow\s*:\s*hidden/u);
    expect(projectListRule?.groups?.body).toMatch(
      /grid-template-columns\s*:\s*repeat\(auto-fit, minmax\(min\(100%, 360px\), 520px\)\)/u,
    );
    expect(projectListRule?.groups?.body).toMatch(/justify-content\s*:\s*start/u);
    expect(projectContentRule?.groups?.body).toMatch(/flex\s*:\s*1 1 auto/u);
    expect(projectContentRule?.groups?.body).toMatch(/overflow-y\s*:\s*auto/u);
    expect(styles).toMatch(/\.project-catalog-hero\s*\{[^}]*min-height\s*:\s*184px/u);
    expect(styles).toMatch(/\.project-catalog-collection__header\s*\{[^}]*display\s*:\s*flex/u);
    expect(styles).toMatch(
      /\.project-management-catalog \.management-search-field\s*\{[^}]*width\s*:\s*clamp\(220px, 24vw, 288px\)[^}]*min-height\s*:\s*36px[^}]*flex\s*:\s*0 1 288px/u,
    );
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-role='management'\]\s*>\s*\.project-main-group__content\s*\{[\s\S]*?height\s*:\s*100%/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\[data-empty='true'\]\s*\{[\s\S]*?display\s*:\s*grid[\s\S]*?grid-template-columns\s*:\s*minmax\(0, 1fr\)[\s\S]*?flex\s*:\s*1/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\.is-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*repeat\(auto-fill, minmax\(min\(100%, 280px\), 280px\)\)[\s\S]*?justify-content\s*:\s*start/u,
    );
    expect(styles).toMatch(
      /\.management-surface-list\.is-grid \.management-surface-row\s*\{[\s\S]*?min-height\s*:\s*100px[\s\S]*?flex-direction\s*:\s*column/u,
    );
    expect(styles).toMatch(
      /\.management-surface-header h2\s*\{[^}]*font-size\s*:\s*20px[^}]*font-weight\s*:\s*720/u,
    );
    expect(styles).toMatch(
      /\.management-surface-project-icon\s*\{[^}]*width\s*:\s*32px[^}]*height\s*:\s*32px[^}]*border-radius\s*:\s*50%/u,
    );
    expect(styles).toMatch(
      /\.management-surface-row\s*\{[^}]*border-radius\s*:\s*13px[^}]*background\s*:\s*var\(--neko-desktop-surface-raised\)/u,
    );
    expect(styles).toMatch(
      /@media \(max-width: 820px\)\s*\{[\s\S]*?\.project-management-catalog\s*\{[^}]*width\s*:\s*calc\(100% - 32px\)/u,
    );
    expect(styles).toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\] \.management-surface-list\.is-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*1fr/u,
    );
    expect(styles).toMatch(
      /\.project-catalog-collection \.management-surface-list\.is-grid \.management-surface-row\s*\{[^}]*min-height\s*:\s*84px[^}]*flex-direction\s*:\s*row/u,
    );
    expect(styles).toMatch(
      /\.project-catalog-card__more\s*\{[^}]*position\s*:\s*absolute[^}]*width\s*:\s*30px/u,
    );
    expect(styles).toMatch(/\.project-catalog-card-menu__items button\s*\{[^}]*width\s*:\s*100%/u);
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

  it('aligns Character and World catalogs while preserving package-owned details', () => {
    const characterStyles = readFileSync(
      new URL('../../../packages/chara/webview/src/style.css', import.meta.url),
      'utf8',
    );
    const worldStyles = readFileSync(
      new URL('../../../packages/world/webview/src/style.css', import.meta.url),
      'utf8',
    );
    const panelRule = styles.match(/\.desktop-workbench-main-panel\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(panelRule?.groups?.body).toMatch(
      /--neko-management-content-top\s*:\s*clamp\(66px, 10vh, 104px\)/u,
    );
    expect(panelRule?.groups?.body).toMatch(/--neko-management-content-inline\s*:\s*32px/u);
    expect(characterStyles).toMatch(
      /\.character-management__content\s*\{[^}]*width\s*:\s*min\(1118px, calc\(100% - 72px\)\)[^}]*gap\s*:\s*36px[^}]*padding\s*:\s*clamp\(48px, 7vh, 76px\) 0 48px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__hero\s*\{[^}]*min-height\s*:\s*184px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__hero-actions\s*\{[^}]*display\s*:\s*flex[^}]*flex-wrap\s*:\s*wrap[^}]*gap\s*:\s*8px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__search\s*\{[^}]*width\s*:\s*clamp\(220px, 24vw, 288px\)[^}]*flex\s*:\s*0 1 288px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__catalog\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fill, minmax\(min\(100%, 214px\), 214px\)\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(
      characterStyles.match(/\.character-management__catalog\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups
        ?.body,
    ).not.toMatch(/min-height/u);
    expect(characterStyles).toMatch(
      /\.character-management__catalog\.is-empty\s*\{[^}]*min-height\s*:\s*220px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__catalog-item\s*\{[^}]*border-radius\s*:\s*13px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__catalog \.character-management__catalog-item\s*\{[^}]*min-height\s*:\s*96px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__avatar-placeholder\s*\{[^}]*width\s*:\s*32px[^}]*height\s*:\s*32px[^}]*border-radius\s*:\s*50%/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__template-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fit, minmax\(min\(236px, 100%\), 280px\)\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management__template-card\s*\{[^}]*min-height\s*:\s*250px[^}]*border-radius\s*:\s*13px/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management-detail\s*\{[^}]*width\s*:\s*min\(100%, 1020px\)/u,
    );
    expect(characterStyles).toMatch(
      /\.character-management-detail__identity\s*\{[^}]*padding\s*:\s*var\(--neko-management-content-top[^}]*var\(--neko-management-content-inline/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__content\s*\{[^}]*width\s*:\s*min\(1118px, calc\(100% - 72px\)\)[^}]*gap\s*:\s*36px[^}]*padding\s*:\s*clamp\(48px, 7vh, 76px\) 0 48px/u,
    );
    expect(worldStyles).toMatch(/\.world-management__hero\s*\{[^}]*min-height\s*:\s*184px/u);
    expect(worldStyles).toMatch(
      /\.world-management__hero-actions\s*\{[^}]*display\s*:\s*flex[^}]*flex-wrap\s*:\s*wrap[^}]*gap\s*:\s*8px/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__search\s*\{[^}]*width\s*:\s*clamp\(220px, 24vw, 288px\)[^}]*flex\s*:\s*0 1 288px/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__catalog-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fill, minmax\(min\(100%, 280px\), 280px\)\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(
      worldStyles.match(/\.world-management__catalog-grid\s*\{(?<body>[\s\S]*?)\n\}/u)?.groups
        ?.body,
    ).not.toMatch(/min-height/u);
    expect(worldStyles).toMatch(
      /\.world-management__catalog-grid\.is-empty\s*\{[^}]*min-height\s*:\s*220px/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__world-card\s*\{[^}]*min-height\s*:\s*112px[^}]*border-radius\s*:\s*13px/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__world-icon\s*\{[^}]*width\s*:\s*32px[^}]*height\s*:\s*32px[^}]*border-radius\s*:\s*50%/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__template-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fit, minmax\(min\(236px, 100%\), 280px\)\)[^}]*justify-content\s*:\s*start/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__template-card\s*\{[^}]*min-height\s*:\s*250px[^}]*border-radius\s*:\s*13px/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__detail-section:first-child\s*\{[^}]*padding-top\s*:\s*var\(--neko-management-content-top/u,
    );
    expect(worldStyles).toMatch(
      /\.world-management__detail-section\s*\{[^}]*var\(--neko-management-content-inline/u,
    );
    expect(worldStyles).toMatch(
      /@container \(max-width: 720px\)\s*\{[\s\S]*?\.world-management__content\s*\{[^}]*width\s*:\s*min\(100% - 32px, 1118px\)[^}]*padding\s*:\s*40px 0 36px/u,
    );
    expect(styles).toMatch(/\.project-template-quick-starts\s*\{[^}]*gap\s*:\s*14px/u);
    expect(styles).toMatch(
      /\.project-template-quick-starts h2\s*\{[^}]*font-size\s*:\s*14px[^}]*font-weight\s*:\s*690/u,
    );
  });

  it('keeps the Global Library as an aligned unframed workbench surface', () => {
    const packageStyles = readFileSync(
      new URL('../../../packages/assets/webview/src/global-library/style.css', import.meta.url),
      'utf8',
    );
    const browserRule = packageStyles.match(/\.global-library-browser\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(browserRule?.groups?.body).toMatch(/height\s*:\s*100%/u);
    expect(browserRule?.groups?.body).toMatch(/width\s*:\s*min\(1118px, calc\(100% - 72px\)\)/u);
    expect(browserRule?.groups?.body).toMatch(/margin\s*:\s*0 auto/u);
    expect(browserRule?.groups?.body).not.toMatch(/border-radius/u);
    expect(packageStyles).not.toMatch(/\.global-library-browser__header(?:\s|,|\{)/u);
    expect(packageStyles).not.toMatch(/\.global-library-browser__header-copy/u);
    expect(packageStyles).toMatch(
      /\.global-library-browser__visually-hidden\s*\{[^}]*position\s*:\s*absolute/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__toolbar\s*\{[\s\S]*?margin-bottom\s*:\s*20px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__commands button,[\s\S]*?min-height\s*:\s*36px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__collection\s*\{[\s\S]*?padding\s*:\s*10px 0 0/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__search\s*\{[\s\S]*?width\s*:\s*auto[\s\S]*?flex\s*:\s*1 1 320px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__collection\[data-view-mode='grid'\]\s*\{[^}]*grid-template-columns\s*:\s*repeat\(auto-fill, minmax\(min\(100%, 176px\), 176px\)\)[^}]*grid-auto-rows\s*:\s*132px[^}]*justify-content\s*:\s*start/u,
    );
    expect(packageStyles).toMatch(
      /\[data-view-mode='grid'\] \.global-library-browser__entry\s*\{[^}]*border-radius\s*:\s*13px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading\s*\{[\s\S]*?min-height\s*:\s*160px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__empty-state\s*\{[^}]*min-height\s*:\s*260px[^}]*justify-content\s*:\s*flex-start/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__loading\s*\{[\s\S]*?place-items\s*:\s*center/u,
    );
    expect(packageStyles).not.toMatch(/\.global-library-browser__toolbar-actions\s*>\s*button/u);
    expect(packageStyles).toMatch(
      /\.global-library-browser__toolbar-actions\s*\{[^}]*display\s*:\s*flex[^}]*justify-content\s*:\s*flex-end[^}]*gap\s*:\s*8px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser\[data-catalog='media-library'\][\s\S]*?\.global-library-browser__entry\s*\{[^}]*border-radius\s*:\s*10px[^}]*background\s*:\s*var\(--neko-elevated/u,
    );
    expect(packageStyles).toMatch(
      /@container \(max-width: 700px\)\s*\{[\s\S]*?\.global-library-browser__toolbar-actions\s*\{[^}]*width\s*:\s*100%[^}]*flex-wrap\s*:\s*wrap/u,
    );
    expect(styles).not.toMatch(
      /\.desktop-workbench-main-panel\[data-panel-size='compact'\] \.global-library-browser/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__commands button\s*\{[\s\S]*?background\s*:\s*var\(--neko-button-background/u,
    );
    expect(styles).toMatch(
      /\.project-catalog-hero__copy button\s*\{[^}]*background\s*:\s*var\(--neko-button-background\)/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser button\[aria-pressed='true'\]\s*\{[\s\S]*?var\(--neko-list-activeSelectionBackground/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser__modes\s*\{[^}]*align-self\s*:\s*center[^}]*margin-bottom\s*:\s*28px/u,
    );
    expect(packageStyles).toMatch(
      /\.global-library-browser \.global-library-browser__modes button\[aria-pressed='true'\]\s*\{[^}]*background\s*:\s*var\(--neko-button-background/u,
    );
    expect(packageStyles).not.toMatch(
      /var\(--neko-(?:text-(?:primary|secondary|tertiary)|surface-(?:subtle|muted)|border-strong)/u,
    );
  });

  it('lets compact Text Editor panes reclaim the hidden outline column', () => {
    const packageStyles = readFileSync(
      new URL('../../../packages/text-editor/webview/src/style.css', import.meta.url),
      'utf8',
    );
    const compactStyles = packageStyles.slice(
      packageStyles.indexOf('@container (max-width: 720px)'),
    );

    expect(compactStyles).toMatch(
      /\.neko-text-editor-body:has\(\.neko-text-editor-outline\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);\s*\}/u,
    );
    expect(compactStyles).toMatch(
      /\.neko-text-editor-body\[data-presentation-mode='split'\],[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);/u,
    );
    expect(compactStyles).toMatch(/\.neko-text-editor-outline\s*\{\s*display:\s*none;\s*\}/u);
  });
});
