import { describe, expect, it } from 'vitest';
import packageJson from '../../../../package.json';

describe('preview package contributions', () => {
  it('does not contribute retired panoramic viewers, commands, menus, or settings', () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);
    const customEditors = packageJson.contributes.customEditors.map((editor) => editor.viewType);
    const configuration =
      'configuration' in packageJson.contributes
        ? packageJson.contributes.configuration.properties
        : {};

    expect(commands).not.toContain('neko.preview.openPanoramicImage');
    expect(commands).not.toContain('neko.preview.openPanoramicVideo');
    expect(commands).not.toContain('neko.preview.openBestPanoramic');
    expect(customEditors).not.toContain('neko.preview.panoramicImage');
    expect(customEditors).not.toContain('neko.preview.panoramicVideo');
    expect(configuration).not.toHaveProperty('neko.preview.viewer.panoramic.enabled');
    expect(configuration).not.toHaveProperty('neko.preview.viewer.panoramic.video');
    expect(packageJson.contributes).not.toHaveProperty('menus');
  });

  it('contributes an explicit no-source 3D Reference guide command', () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toContain('neko.preview.openThreeReferenceGuide');
    expect(packageJson.activationEvents).not.toContain(
      'onCommand:neko.preview.openThreeReferenceGuide',
    );
  });
});
