import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./renderer/styles.css', import.meta.url), 'utf8');

describe('Desktop Settings button styles', () => {
  it('uses semantic primary and secondary colors for enabled actions', () => {
    const primaryActionRule = styles.match(
      /\.desktop-settings__row select,\s*\.desktop-settings__action\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const quietActionRule = styles.match(
      /\.desktop-settings__action\.desktop-settings__action--quiet\s*\{(?<body>[\s\S]*?)\n\}/u,
    );
    const disabledActionRule = styles.match(
      /\.desktop-settings__action:disabled,\s*\.desktop-settings__row select:disabled\s*\{(?<body>[\s\S]*?)\n\}/u,
    );

    expect(primaryActionRule?.groups?.body).toMatch(/color\s*:\s*var\(--neko-button-foreground/u);
    expect(primaryActionRule?.groups?.body).toMatch(
      /background\s*:\s*var\(--neko-button-background/u,
    );
    expect(quietActionRule?.groups?.body).toMatch(/color\s*:\s*var\(--neko-button-background/u);
    expect(quietActionRule?.groups?.body).toMatch(/background\s*:\s*transparent/u);
    expect(disabledActionRule?.groups?.body).toMatch(/color\s*:\s*var\(--neko-desktop-text-muted/u);
    expect(disabledActionRule?.groups?.body).toMatch(
      /background\s*:\s*var\(--neko-desktop-control\)/u,
    );
  });
});
