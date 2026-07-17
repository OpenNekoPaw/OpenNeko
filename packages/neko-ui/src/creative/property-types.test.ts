import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TREE_VIEW_VIRTUALIZATION,
  assertNever,
  type PropertyDefinition,
  type PropertyPanelProps,
} from './index';

describe('@neko/ui creative contracts', () => {
  it('models property definitions as per-kind discriminated unions', () => {
    const definitions: readonly PropertyDefinition[] = [
      { id: 'opacity', kind: 'number', label: 'Opacity', value: 80, min: 0, max: 100 },
      { id: 'scale', kind: 'slider', label: 'Scale', value: 1, min: 0, max: 4 },
      { id: 'name', kind: 'text', label: 'Name', value: 'Layer 1' },
      { id: 'fill', kind: 'color', label: 'Fill', value: '#ffffff', alpha: 1 },
      { id: 'visible', kind: 'boolean', label: 'Visible', value: true },
      {
        id: 'blend',
        kind: 'select',
        label: 'Blend',
        value: 'normal',
        options: [{ value: 'normal', label: 'Normal' }],
      },
    ];

    expect(definitions.map(mapPropertyKind)).toEqual([
      'number:80',
      'slider:1',
      'text:Layer 1',
      'color:#ffffff',
      'boolean:true',
      'select:normal:1',
    ]);
  });

  it('keeps preview and commit callbacks separate in panel props', () => {
    const events: string[] = [];
    const props: PropertyPanelProps = {
      properties: [{ id: 'opacity', kind: 'number', label: 'Opacity', value: 1 }],
      onPreviewChange: (id, value) => events.push(`preview:${id}:${value}`),
      onCommit: (id, value) => events.push(`commit:${id}:${value}`),
    };

    props.onPreviewChange?.('opacity', 0.5);
    props.onCommit?.('opacity', 1);

    expect(events).toEqual(['preview:opacity:0.5', 'commit:opacity:1']);
  });

  it('declares the default TreeView virtualization threshold', () => {
    expect(DEFAULT_TREE_VIEW_VIRTUALIZATION).toMatchObject({
      enabled: true,
      threshold: 200,
      itemHeight: 24,
    });
  });
});

function mapPropertyKind(definition: PropertyDefinition): string {
  switch (definition.kind) {
    case 'number':
      return `number:${definition.value}`;
    case 'slider':
      return `slider:${definition.value}`;
    case 'text':
      return `text:${definition.value}`;
    case 'color':
      return `color:${definition.value}`;
    case 'boolean':
      return `boolean:${definition.value}`;
    case 'select':
      return `select:${definition.value}:${definition.options.length}`;
    default:
      return assertNever(definition);
  }
}
