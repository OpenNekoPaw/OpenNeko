/**
 * PortEditor - Port management panel for canvas nodes
 *
 * Allows viewing, adding, editing, and removing port definitions on nodes.
 * Supports both custom ports and default port configurations.
 */

import { useState, useCallback } from 'react';
import type { CanvasNode, PortDefinition, ConnectionAnchor, PortDataType } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface PortEditorProps {
  node: CanvasNode;
  onUpdatePorts: (nodeId: string, ports: PortDefinition[]) => void;
}

// =============================================================================
// Constants
// =============================================================================

const PORT_DIRECTIONS: Array<{ value: 'input' | 'output'; label: string }> = [
  { value: 'input', label: 'Input' },
  { value: 'output', label: 'Output' },
];

const PORT_POSITIONS: Array<{ value: ConnectionAnchor; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
];

const PORT_DATA_TYPES: Array<{ value: PortDataType; label: string; color: string }> = [
  { value: 'any', label: 'Any', color: '#6b7280' },
  { value: 'image', label: 'Image', color: '#f59e0b' },
  { value: 'video', label: 'Video', color: '#8b5cf6' },
  { value: 'audio', label: 'Audio', color: '#ec4899' },
  { value: 'text', label: 'Text', color: '#06b6d4' },
];

// =============================================================================
// Component
// =============================================================================

export function PortEditor({ node, onUpdatePorts }: PortEditorProps) {
  const [isAddingPort, setIsAddingPort] = useState(false);

  // Determine if node uses custom or default ports
  const hasCustomPorts = node.ports != null;
  const activePorts = node.ports ?? getDefaultPorts(node.type);

  const handleCustomize = useCallback(() => {
    // Copy default ports to node as custom ports
    const defaultPorts = getDefaultPorts(node.type);
    onUpdatePorts(node.id, [...defaultPorts]);
  }, [node.id, node.type, onUpdatePorts]);

  const handleResetToDefault = useCallback(() => {
    // Remove custom ports, revert to defaults
    onUpdatePorts(node.id, []);
  }, [node.id, onUpdatePorts]);

  const handleRemovePort = useCallback(
    (portId: string) => {
      const updated = activePorts.filter((p) => p.id !== portId);
      onUpdatePorts(node.id, updated);
    },
    [node.id, activePorts, onUpdatePorts],
  );

  const handleUpdatePort = useCallback(
    (portId: string, updates: Partial<PortDefinition>) => {
      const updated = activePorts.map((p) => (p.id === portId ? { ...p, ...updates } : p));
      onUpdatePorts(node.id, updated);
    },
    [node.id, activePorts, onUpdatePorts],
  );

  const handleAddPort = useCallback(
    (newPort: PortDefinition) => {
      onUpdatePorts(node.id, [...activePorts, newPort]);
      setIsAddingPort(false);
    },
    [node.id, activePorts, onUpdatePorts],
  );

  return (
    <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--toolbar-border)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium" style={{ color: 'var(--panel-fg-secondary)' }}>
          {t('panel.ports')}
        </div>
        <div className="flex gap-1">
          {!hasCustomPorts ? (
            <button
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                backgroundColor: 'var(--control-bg)',
                color: 'var(--panel-fg)',
                border: '1px solid var(--control-border)',
              }}
              onClick={handleCustomize}
            >
              {t('panel.customizePorts')}
            </button>
          ) : (
            <>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  color: 'var(--panel-fg)',
                  border: '1px solid var(--control-border)',
                }}
                onClick={() => setIsAddingPort(true)}
              >
                + {t('panel.addPort')}
              </button>
              <button
                className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  color: 'var(--panel-fg-secondary)',
                  border: '1px solid var(--control-border)',
                }}
                onClick={handleResetToDefault}
                title="Reset to default ports"
              >
                ↺
              </button>
            </>
          )}
        </div>
      </div>

      {/* Default ports indicator */}
      {!hasCustomPorts && (
        <div className="text-[10px] italic mb-1.5" style={{ color: 'var(--panel-fg-secondary)' }}>
          {t('panel.defaultPorts')}
        </div>
      )}

      {/* Port list */}
      <div className="space-y-1.5">
        {activePorts.length === 0 ? (
          <div className="text-[10px] italic" style={{ color: 'var(--panel-fg-secondary)' }}>
            No ports
          </div>
        ) : (
          activePorts.map((port) => (
            <PortItem
              key={port.id}
              port={port}
              editable={hasCustomPorts}
              onUpdate={(updates) => handleUpdatePort(port.id, updates)}
              onRemove={() => handleRemovePort(port.id)}
            />
          ))
        )}
      </div>

      {/* Add port form */}
      {isAddingPort && (
        <AddPortForm
          existingIds={activePorts.map((p) => p.id)}
          onAdd={handleAddPort}
          onCancel={() => setIsAddingPort(false)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function PortItem({
  port,
  editable,
  onUpdate,
  onRemove,
}: {
  port: PortDefinition;
  editable: boolean;
  onUpdate: (updates: Partial<PortDefinition>) => void;
  onRemove: () => void;
}) {
  const dataTypeInfo = PORT_DATA_TYPES.find((dt) => dt.value === (port.dataType ?? 'any'));
  const color = dataTypeInfo?.color ?? '#6b7280';

  return (
    <div
      className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px]"
      style={{ backgroundColor: 'var(--control-bg)' }}
    >
      {/* Port type indicator */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: color,
          border: port.type === 'input' ? '2px solid var(--control-bg)' : 'none',
          boxShadow: port.type === 'input' ? `inset 0 0 0 1px ${color}` : 'none',
        }}
        title={port.type}
      />

      {/* Label / ID */}
      {editable ? (
        <input
          className="flex-1 min-w-0 text-[10px] px-1 py-0 rounded border-0 outline-none"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--panel-fg)',
          }}
          value={port.label ?? port.id}
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
          onFocus={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--control-hover)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      ) : (
        <span className="flex-1 truncate" style={{ color: 'var(--panel-fg)' }}>
          {port.label ?? port.id}
        </span>
      )}

      {/* Data type selector */}
      {editable ? (
        <select
          className="text-[10px] px-0.5 py-0 rounded border-0 outline-none"
          style={{
            backgroundColor: 'transparent',
            color,
          }}
          value={port.dataType ?? 'any'}
          onChange={(e) => onUpdate({ dataType: e.target.value as PortDataType })}
        >
          {PORT_DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
      ) : (
        <span style={{ color }} className="flex-shrink-0">
          {dataTypeInfo?.label ?? 'Any'}
        </span>
      )}

      {/* Position indicator */}
      {editable ? (
        <select
          className="text-[10px] px-0.5 py-0 rounded border-0 outline-none w-10"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--panel-fg-secondary)',
          }}
          value={port.position}
          onChange={(e) => onUpdate({ position: e.target.value as ConnectionAnchor })}
        >
          {PORT_POSITIONS.map((pos) => (
            <option key={pos.value} value={pos.value}>
              {pos.label[0]}
            </option>
          ))}
        </select>
      ) : (
        <span className="flex-shrink-0" style={{ color: 'var(--panel-fg-secondary)' }}>
          {port.position[0]?.toUpperCase()}
        </span>
      )}

      {/* Remove button */}
      {editable && (
        <button
          className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
          style={{ color: '#f48771' }}
          onClick={onRemove}
          title={t('panel.removePort')}
        >
          ×
        </button>
      )}
    </div>
  );
}

function AddPortForm({
  existingIds,
  onAdd,
  onCancel,
}: {
  existingIds: string[];
  onAdd: (port: PortDefinition) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [type, setType] = useState<'input' | 'output'>('input');
  const [position, setPosition] = useState<ConnectionAnchor>('left');
  const [dataType, setDataType] = useState<PortDataType>('any');

  const isIdValid = id.length > 0 && !existingIds.includes(id);

  const handleSubmit = () => {
    if (!isIdValid) return;
    onAdd({
      id,
      type,
      position: type === 'input' ? 'left' : 'right',
      dataType,
      label: id,
    });
  };

  // Auto-set position based on type
  const handleTypeChange = (newType: 'input' | 'output') => {
    setType(newType);
    setPosition(newType === 'input' ? 'left' : 'right');
  };

  return (
    <div
      className="mt-2 p-2 rounded space-y-1.5"
      style={{
        backgroundColor: 'var(--control-hover)',
        border: '1px solid var(--control-border)',
      }}
    >
      <div className="flex gap-1">
        <input
          className="flex-1 text-[10px] px-1.5 py-0.5 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: isIdValid || id.length === 0 ? 'var(--control-border)' : '#f48771',
            color: 'var(--panel-fg)',
          }}
          placeholder="Port ID"
          value={id}
          onChange={(e) => setId(e.target.value.replace(/\s/g, '_'))}
          autoFocus
        />
      </div>

      <div className="flex gap-1">
        <select
          className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--panel-fg)',
          }}
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as 'input' | 'output')}
        >
          {PORT_DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <select
          className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--panel-fg)',
          }}
          value={dataType}
          onChange={(e) => setDataType(e.target.value as PortDataType)}
        >
          {PORT_DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>

        <select
          className="w-12 text-[10px] px-1 py-0.5 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--panel-fg)',
          }}
          value={position}
          onChange={(e) => setPosition(e.target.value as ConnectionAnchor)}
        >
          {PORT_POSITIONS.map((pos) => (
            <option key={pos.value} value={pos.value}>
              {pos.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 justify-end">
        <button
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{
            backgroundColor: 'var(--control-bg)',
            color: 'var(--panel-fg-secondary)',
            border: '1px solid var(--control-border)',
          }}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{
            backgroundColor: isIdValid ? 'var(--node-selected)' : 'var(--control-bg)',
            color: isIdValid ? 'white' : 'var(--panel-fg-secondary)',
            border: '1px solid var(--control-border)',
            opacity: isIdValid ? 1 : 0.5,
            cursor: isIdValid ? 'pointer' : 'not-allowed',
          }}
          onClick={handleSubmit}
          disabled={!isIdValid}
        >
          {t('panel.addPort')}
        </button>
      </div>
    </div>
  );
}
