import { describe, expect, it } from 'vitest';
import packageJson from '../../../../package.json';

describe('panoramic preview package contributions', () => {
  it('contributes explicit image and video open commands to resource menus', () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toContain('neko.preview.openPanoramicImage');
    expect(commands).toContain('neko.preview.openPanoramicVideo');

    const explorerCommands = packageJson.contributes.menus['explorer/context'].map(
      (entry) => entry.command,
    );
    const editorTitleCommands = packageJson.contributes.menus['editor/title'].map(
      (entry) => entry.command,
    );

    expect(explorerCommands).toContain('neko.preview.openPanoramicImage');
    expect(explorerCommands).toContain('neko.preview.openPanoramicVideo');
    expect(editorTitleCommands).toContain('neko.preview.openPanoramicImage');
    expect(editorTitleCommands).toContain('neko.preview.openPanoramicVideo');
  });

  it('contributes an explicit no-source 3D Reference guide command', () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toContain('neko.preview.openThreeReferenceGuide');
    expect(packageJson.activationEvents).toContain(
      'onCommand:neko.preview.openThreeReferenceGuide',
    );
  });
});
