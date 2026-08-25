import { describe, expect, it } from 'vitest';
import { parseCharacterLocalizedAssetBindingCatalog } from '../character-localized-asset';

describe('Character localized asset binding contracts', () => {
  it('parses an exact opaque representation-to-entry and file inventory', () => {
    expect(parseCharacterLocalizedAssetBindingCatalog(validCatalog())).toEqual(validCatalog());
  });

  it.each([
    {
      label: 'raw file reference',
      value: () => ({
        ...validCatalog(),
        bindings: [{ ...validCatalog().bindings[0], resourceRef: 'file:///private/model.json' }],
      }),
      message: /opaque non-file/u,
    },
    {
      label: 'entry outside the inventory',
      value: () => ({
        ...validCatalog(),
        bindings: [
          { ...validCatalog().bindings[0], entryRelativeAssetPath: 'live2d/missing.json' },
        ],
      }),
      message: /entry path must identify/u,
    },
    {
      label: 'duplicate owned file',
      value: () => ({
        ...validCatalog(),
        bindings: [
          ...validCatalog().bindings,
          {
            representationId: 'portrait-main',
            kind: 'portrait',
            resourceRef: 'asset:portrait-main',
            entryRelativeAssetPath: 'live2d/texture.png',
            files: [
              {
                relativeAssetPath: 'live2d/texture.png',
                mediaType: 'image/png',
                byteLength: 12,
              },
            ],
          },
        ],
      }),
      message: /duplicate identity/u,
    },
  ])('rejects $label', ({ value, message }) => {
    expect(() => parseCharacterLocalizedAssetBindingCatalog(value())).toThrow(message);
  });

  it('rejects an internal format generation field', () => {
    const forbiddenField = ['schema', 'Version'].join('');
    expect(() =>
      parseCharacterLocalizedAssetBindingCatalog({
        ...validCatalog(),
        [forbiddenField]: 1,
      }),
    ).toThrow(/unsupported fields/u);
  });
});

function validCatalog() {
  return {
    characterProjectId: 'character-project-a',
    bindings: [
      {
        representationId: 'live2d-main',
        kind: 'live2d' as const,
        resourceRef: 'asset:live2d-main',
        entryRelativeAssetPath: 'live2d/model.model3.json',
        files: [
          {
            relativeAssetPath: 'live2d/model.model3.json',
            mediaType: 'application/json',
            byteLength: 24,
          },
          {
            relativeAssetPath: 'live2d/texture.png',
            mediaType: 'image/png',
            byteLength: 12,
          },
        ],
      },
    ],
  };
}
