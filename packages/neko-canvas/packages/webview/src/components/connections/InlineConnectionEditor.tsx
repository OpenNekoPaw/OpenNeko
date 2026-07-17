import type React from 'react';
import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { CANVAS_CONNECTION_TYPES, isCanvasConnectionType } from '@neko/shared';
import { t } from '../../i18n';
import { getConnectionPathGeometry } from './connectionGeometry';
import {
  resolveConnectionDirectionLabel,
  resolveConnectionTypeLabel,
} from '../../i18n/connectionLabels';

const INLINE_CONNECTION_CONTROL_CLASS = 'w-full rounded px-2 py-1 text-xs outline-none';
const INLINE_CONNECTION_CONTROL_STYLE: React.CSSProperties = {
  border: '1px solid var(--control-border)',
  backgroundColor: 'var(--control-bg)',
  color: 'var(--control-fg)',
};

export interface InlineConnectionEditorProps {
  connection: CanvasConnection | null;
  nodes: readonly CanvasNode[];
  onUpdateConnection: (id: string, updates: Partial<CanvasConnection>) => void;
}

export function InlineConnectionEditor({
  connection,
  nodes,
  onUpdateConnection,
}: InlineConnectionEditorProps) {
  if (!connection) return null;

  const sourceNode = nodes.find((node) => node.id === connection.sourceId);
  const targetNode = nodes.find((node) => node.id === connection.targetId);
  if (!sourceNode || !targetNode) return null;

  const geometry = getConnectionPathGeometry(connection, sourceNode, targetNode);
  const connectionType = connection.type ?? 'default';

  const update = (updates: Partial<CanvasConnection>) => {
    onUpdateConnection(connection.id, updates);
  };

  return (
    <div
      className="absolute z-30 w-[260px] rounded-lg p-3 text-xs shadow-lg"
      style={{
        left: geometry.midX + 16,
        top: geometry.midY + 16,
        backgroundColor: 'var(--toolbar-bg)',
        border: '1px solid var(--toolbar-border)',
        color: 'var(--toolbar-fg)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">{t('panel.connection')}</span>
        <span style={{ color: 'var(--toolbar-fg-secondary)' }}>
          {resolveConnectionDirectionLabel(sourceNode, targetNode)}
        </span>
      </div>

      <div className="space-y-2">
        <Field label={t('panel.connectionLabel')}>
          <input
            value={connection.label ?? ''}
            placeholder={t('panel.connectionLabelPlaceholder')}
            onChange={(event) => update({ label: event.target.value || undefined })}
            className={INLINE_CONNECTION_CONTROL_CLASS}
            style={INLINE_CONNECTION_CONTROL_STYLE}
          />
        </Field>

        <Field label={t('panel.connectionType')}>
          <select
            value={connectionType}
            onChange={(event) => {
              const value = event.target.value;
              if (isCanvasConnectionType(value)) {
                update({ type: value });
              }
            }}
            className={INLINE_CONNECTION_CONTROL_CLASS}
            style={INLINE_CONNECTION_CONTROL_STYLE}
          >
            {CANVAS_CONNECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {resolveConnectionTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>

        {connectionType === 'choice' && (
          <>
            <Field label={t('panel.choiceText')}>
              <input
                value={connection.choiceText ?? ''}
                onChange={(event) => update({ choiceText: event.target.value || undefined })}
                className={INLINE_CONNECTION_CONTROL_CLASS}
                style={INLINE_CONNECTION_CONTROL_STYLE}
              />
            </Field>
            <Field label={t('panel.condition')}>
              <input
                value={connection.condition ?? ''}
                onChange={(event) => update({ condition: event.target.value || undefined })}
                className={INLINE_CONNECTION_CONTROL_CLASS}
                style={INLINE_CONNECTION_CONTROL_STYLE}
              />
            </Field>
            <Field label={t('panel.priority')}>
              <input
                type="number"
                value={connection.priority ?? 0}
                onChange={(event) => update({ priority: Number(event.target.value) })}
                className={INLINE_CONNECTION_CONTROL_CLASS}
                style={INLINE_CONNECTION_CONTROL_STYLE}
              />
            </Field>
          </>
        )}

        {(connectionType === 'association' || connectionType === 'derived-from') && (
          <>
            <Field label={t('panel.weight')}>
              <input
                type="number"
                step="0.1"
                value={connection.weight ?? 1}
                onChange={(event) => update({ weight: Number(event.target.value) })}
                className={INLINE_CONNECTION_CONTROL_CLASS}
                style={INLINE_CONNECTION_CONTROL_STYLE}
              />
            </Field>
            <Field label={t('panel.decay')}>
              <input
                type="number"
                step="0.1"
                value={connection.decay ?? 0}
                onChange={(event) => update({ decay: Number(event.target.value) })}
                className={INLINE_CONNECTION_CONTROL_CLASS}
                style={INLINE_CONNECTION_CONTROL_STYLE}
              />
            </Field>
          </>
        )}

        {(connectionType === 'transition' || connectionType === 'child') && (
          <Field label={t('panel.condition')}>
            <input
              value={connection.condition ?? ''}
              onChange={(event) => update({ condition: event.target.value || undefined })}
              className={INLINE_CONNECTION_CONTROL_CLASS}
              style={INLINE_CONNECTION_CONTROL_STYLE}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span style={{ color: 'var(--toolbar-fg-secondary)' }}>{label}</span>
      {children}
    </label>
  );
}
