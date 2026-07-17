import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentSource = readFileSync(resolve(__dirname, 'PreviewControls.tsx'), 'utf8');

describe('PreviewControls narrow-layout structure', () => {
  it('keeps primary playback controls outside settings and overflow menus', () => {
    const primaryStart = componentSource.indexOf('cut-preview-primary-controls');
    const secondaryStart = componentSource.indexOf('cut-preview-secondary-controls');
    const settingsMenuStart = componentSource.indexOf("aria-label={t('preview.settings')}");
    const overflowMenuStart = componentSource.indexOf("aria-label={t('preview.moreActions')}");

    expect(primaryStart).toBeGreaterThan(-1);
    expect(secondaryStart).toBeGreaterThan(primaryStart);
    expect(settingsMenuStart).toBeGreaterThan(secondaryStart);
    expect(overflowMenuStart).toBeGreaterThan(settingsMenuStart);
  });

  it('keeps low-frequency preview actions accessible through the overflow menu', () => {
    const overflowStart = componentSource.indexOf("aria-label={t('preview.moreActions')}");
    const overflowSource = componentSource.slice(overflowStart);

    expect(overflowSource).toContain('toggleFpsCounter');
    expect(overflowSource).toContain('onCaptureScreenshot');
    expect(overflowSource).toContain('__previewPanelTogglePiP');
  });

  it('does not own property panel visibility controls', () => {
    expect(componentSource).not.toContain('onTogglePropertyPanel');
    expect(componentSource).not.toContain('propertyPanelVisible');
  });
});
