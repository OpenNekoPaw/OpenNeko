/**
 * ArtboardNode - 画板节点组件
 * 提供固定尺寸的容器区域，用于独立编辑和导出
 */

import { useCallback, useState } from 'react';
import type { ArtboardCanvasNode, CanvasViewport } from '@neko/shared';
import { ARTBOARD_PRESETS } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { exportArtboard, type ExportFormat } from '../../utils/artboardExport';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { t } from '../../i18n';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface ArtboardNodeProps {
  node: ArtboardCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onNameChange?: (nodeId: string, name: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ArtboardNode({ node, viewport, isSelected, onSelect, onMove }: ArtboardNodeProps) {
  const { name, description, backgroundColor, showBorder = true, preset } = node.data;
  const [exporting, setExporting] = useState(false);

  // 获取预设信息
  const presetInfo = preset ? ARTBOARD_PRESETS[preset] : null;

  const doExport = useCallback(
    async (format: ExportFormat) => {
      const vscodeApi = getGlobalVSCodeApi();
      if (!vscodeApi) return;

      setExporting(true);
      try {
        const width = presetInfo?.width ?? node.size.width;
        const height = presetInfo?.height ?? node.size.height;

        const data = await exportArtboard({
          nodeId: node.id,
          format,
          width,
          height,
          backgroundColor: backgroundColor || '#1a1a1a',
        });

        vscodeApi.postMessage({
          type: 'exportArtboard',
          data: {
            name: name || 'Untitled Artboard',
            format,
            data,
          },
        });
      } catch {
        vscodeApi.postMessage({
          type: 'exportArtboard',
          data: {
            name: name || 'Untitled Artboard',
            format,
            error: true,
          },
        });
      } finally {
        setExporting(false);
      }
    },
    [node.id, name, presetInfo, node.size, backgroundColor],
  );

  const handleExportPng = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      doExport('png');
    },
    [doExport],
  );

  const handleExportSvg = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      doExport('svg');
    },
    [doExport],
  );

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onMove={onMove}
      className="artboard-node"
    >
      <div
        className={clsx('w-full h-full flex flex-col', showBorder && 'border border-gray-600')}
        style={{
          backgroundColor: backgroundColor || '#1a1a1a',
        }}
      >
        {/* ── Header: type tag + name + preset + dimensions + export ── */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-800/80 border-b border-gray-700">
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: '#a855f720', color: '#a855f7' }}
          >
            ARTBOARD
          </span>
          <span className="text-sm font-medium text-gray-200 truncate flex-1 min-w-0">
            {name || 'Untitled Artboard'}
          </span>
          {presetInfo && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400 flex-shrink-0">
              {presetInfo.label}
            </span>
          )}
          <span className="text-xs text-gray-500 flex-shrink-0">
            {node.size.width}×{node.size.height}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0 text-xs text-gray-500">
            {exporting ? (
              <span className="text-yellow-400">{t('artboard.exporting')}</span>
            ) : (
              <>
                <button
                  className="hover:text-gray-300 transition-colors"
                  title={t('artboard.exportPng')}
                  onClick={handleExportPng}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  PNG
                </button>
                <button
                  className="hover:text-gray-300 transition-colors"
                  title={t('artboard.exportSvg')}
                  onClick={handleExportSvg}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  SVG
                </button>
              </>
            )}
          </div>
        </div>

        {/* 画板内容区域 */}
        <div className="flex-1 relative overflow-hidden" data-artboard-content>
          {/* 网格背景 */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(to right, #444 1px, transparent 1px),
                linear-gradient(to bottom, #444 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
            }}
          />
          {/* 中心十字线 */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600/30" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-600/30" />
          </div>
          {description && (
            <div className="absolute bottom-2 left-2 right-2 text-xs text-gray-500 truncate">
              {description}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
