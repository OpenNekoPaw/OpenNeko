import { useMemo } from 'react';
import type { NarrativeVariable } from '@neko/shared';
import { useCanvasStore } from '../../stores/canvasStore';
import { t } from '../../i18n';
import type { FloatingPanelComponentProps } from '../types';

function createNarrativeVariableId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `var-${globalThis.crypto.randomUUID()}`;
  }

  return `var-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function NarrativeVariablesPanel(_props: FloatingPanelComponentProps) {
  const narrative = useCanvasStore((state) => state.canvasData?.narrative);
  const updateCanvasData = useCanvasStore((state) => state.updateCanvasData);

  const variables = narrative?.variables ?? [];

  const nextVariableName = useMemo(() => `var${variables.length + 1}`, [variables.length]);

  const updateVariables = (nextVariables: NarrativeVariable[]) => {
    updateCanvasData({
      narrative: {
        ...(narrative ?? { variables: [] }),
        variables: nextVariables,
      },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium" style={{ color: 'var(--toolbar-fg)' }}>
            {t('panel.narrativeVariables')}
          </div>
          <div
            className="mt-1 text-[11px] leading-snug"
            style={{ color: 'var(--neko-fg-secondary)' }}
          >
            {t('panel.narrativeVariables.description')}
          </div>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs"
          style={{
            backgroundColor: 'var(--button-secondary-bg)',
            color: 'var(--button-secondary-fg)',
            border: '1px solid var(--button-secondary-border)',
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() =>
            updateVariables([
              ...variables,
              {
                id: createNarrativeVariableId(),
                name: nextVariableName,
                value: '',
              },
            ])
          }
        >
          {t('panel.addVariable')}
        </button>
      </div>

      {variables.length === 0 ? (
        <div
          className="rounded border border-dashed px-2 py-3 text-xs"
          style={{
            borderColor: 'var(--control-border)',
            color: 'var(--neko-fg-secondary)',
          }}
        >
          {t('panel.noVariables')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {variables.map((variable) => (
            <div key={variable.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <input
                value={variable.name}
                aria-label={t('panel.variableName')}
                placeholder={t('panel.variableName')}
                onChange={(event) =>
                  updateVariables(
                    variables.map((item) =>
                      item.id === variable.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                value={String(variable.value ?? '')}
                aria-label={t('panel.variableValue')}
                placeholder={t('panel.variableValue')}
                onChange={(event) =>
                  updateVariables(
                    variables.map((item) =>
                      item.id === variable.id ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="rounded px-2 text-xs"
                style={{
                  border: '1px solid var(--danger-border)',
                  backgroundColor: 'var(--danger-soft)',
                  color: 'var(--neko-fg)',
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => updateVariables(variables.filter((item) => item.id !== variable.id))}
              >
                {t('panel.removeVariable')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
