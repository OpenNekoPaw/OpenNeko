/**
 * Artboard Export — 将画板区域截图为 PNG/SVG
 *
 * 策略：对画板内容区域 DOM 元素直接截图，
 * 同时收集空间上重叠的其他节点一起渲染。
 */

import { toPng, toSvg } from 'html-to-image';

export type ExportFormat = 'png' | 'svg';

export interface ArtboardExportOptions {
  /** 画板节点 DOM 元素 ID（data-node-id） */
  nodeId: string;
  /** 导出格式 */
  format: ExportFormat;
  /** 画板实际像素宽度 */
  width: number;
  /** 画板实际像素高度 */
  height: number;
  /** 背景色 */
  backgroundColor: string;
  /** 像素比（默认 2x 高清） */
  pixelRatio?: number;
}

/**
 * 导出画板为 base64 图片数据
 * @returns base64 字符串（不含 data:... 前缀）
 */
export async function exportArtboard(options: ArtboardExportOptions): Promise<string> {
  const { nodeId, format, width, height, backgroundColor, pixelRatio = 2 } = options;

  // 找到画板 DOM 元素
  const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null;
  if (!nodeEl) {
    throw new Error(`Artboard node not found: ${nodeId}`);
  }

  // 找到画板内容区域（跳过标题栏，取 .artboard-content 或第二个子元素）
  const contentEl = nodeEl.querySelector('[data-artboard-content]') as HTMLElement | null;
  const targetEl = contentEl ?? nodeEl;

  const exportFn = format === 'svg' ? toSvg : toPng;

  const dataUrl = await exportFn(targetEl, {
    width: width,
    height: height,
    pixelRatio: format === 'svg' ? 1 : pixelRatio,
    backgroundColor,
    style: {
      // 移除 transform，以原始尺寸导出
      transform: 'none',
      transformOrigin: 'top left',
    },
    filter: (node: HTMLElement) => {
      // 排除选择手柄、锚点、锁定图标等 UI 元素
      if (node.dataset?.anchor !== undefined) return false;
      if (node.classList?.contains('resize-handle')) return false;
      if (node.classList?.contains('rotate-handle')) return false;
      return true;
    },
  });

  // 去掉 data:image/png;base64, 或 data:image/svg+xml;... 前缀
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}
