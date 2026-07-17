import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';
import { createServiceId } from '../base';

// =============================================================================
// 服务标识符
// =============================================================================

export const IStatusBar = createServiceId<IStatusBar>('statusBar');

// =============================================================================
// 接口定义
// =============================================================================

interface StatusInfo {
  currentTime: number;
  totalDuration: number;
  trackCount: number;
  elementCount: number;
  isPlaying: boolean;
  fps: number;
}

/** Export progress info for status bar */
export interface ExportStatusInfo {
  /** Is export in progress */
  isExporting: boolean;
  /** Progress percentage (0-100) */
  percent: number;
  /** Current stage message */
  message: string;
  /** Current frame / total frames */
  currentFrame?: number;
  totalFrames?: number;
  /** Processing FPS */
  currentFps?: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
}

export interface IStatusBar extends vscode.Disposable {
  show(): void;
  hide(): void;
  update(info: StatusInfo): void;
  updateExportProgress(info: ExportStatusInfo): void;
}

// =============================================================================
// IDs
// =============================================================================

const ID = {
  playState: 'neko.cut.playState',
  time: 'neko.cut.time',
  info: 'neko.cut.info',
  export: 'neko.cut.export',
} as const;

// =============================================================================
// 实现
// =============================================================================

export class StatusBar implements IStatusBar {
  private readonly group: StatusBarGroup;
  private isActive: boolean = false;

  constructor() {
    this.group = new StatusBarGroup([
      {
        id: ID.playState,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 100,
        name: 'OpenNeko Play State',
      },
      {
        id: ID.time,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 99,
        name: 'OpenNeko Timeline',
      },
      {
        id: ID.info,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 98,
        name: 'OpenNeko Info',
      },
      {
        id: ID.export,
        alignment: vscode.StatusBarAlignment.Right,
        priority: 1000,
        name: 'OpenNeko Export',
        command: 'neko.showExportPanel',
        visible: 'conditional',
      },
    ]);
  }

  public show(): void {
    this.isActive = true;
    this.group.show();
  }

  public hide(): void {
    this.isActive = false;
    this.group.hide();
  }

  public update(info: StatusInfo): void {
    if (!this.isActive) return;

    // Format time as MM:SS.ms
    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // Play state
    if (info.isPlaying) {
      this.group.update(ID.playState, '$(debug-pause) Playing');
      const playItem = this.group.get(ID.playState);
      if (playItem) {
        playItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        playItem.tooltip = 'Video is playing';
      }
    } else {
      this.group.update(ID.playState, '$(play) Paused');
      const playItem = this.group.get(ID.playState);
      if (playItem) {
        playItem.backgroundColor = undefined;
        playItem.tooltip = 'Video is paused';
      }
    }

    // Time display
    this.group.update(
      ID.time,
      `$(clock) ${formatTime(info.currentTime)} / ${formatTime(info.totalDuration)}`,
      `Current: ${formatTime(info.currentTime)}\nTotal: ${formatTime(info.totalDuration)}\nFPS: ${info.fps}`,
    );

    // Track and element info
    this.group.update(
      ID.info,
      `$(layers) ${info.trackCount} tracks $(file-media) ${info.elementCount} elements`,
      `Tracks: ${info.trackCount}\nElements: ${info.elementCount}`,
    );
  }

  public updateExportProgress(info: ExportStatusInfo): void {
    if (!info.isExporting) {
      this.group.setVisible(ID.export, false);
      return;
    }

    this.group.setVisible(ID.export, true);

    const percent = Math.round(info.percent);

    // Build progress bar (10 chars)
    const filled = Math.floor(percent / 10);
    const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    // Build tooltip with detailed info
    const tooltipLines = [info.message];

    if (info.currentFrame !== undefined && info.totalFrames !== undefined) {
      tooltipLines.push(`帧: ${info.currentFrame}/${info.totalFrames}`);
    }

    if (info.currentFps !== undefined && info.currentFps > 0) {
      tooltipLines.push(`速度: ${info.currentFps.toFixed(1)} fps`);
    }

    if (info.estimatedTimeRemaining !== undefined && info.estimatedTimeRemaining > 0) {
      const seconds = Math.ceil(info.estimatedTimeRemaining / 1000);
      if (seconds < 60) {
        tooltipLines.push(`剩余: 约 ${seconds} 秒`);
      } else {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        tooltipLines.push(`剩余: 约 ${mins}分${secs}秒`);
      }
    }

    tooltipLines.push('', '点击查看详情');

    this.group.update(
      ID.export,
      `$(sync~spin) 导出中 ${progressBar} ${percent}%`,
      tooltipLines.join('\n'),
    );

    const exportItem = this.group.get(ID.export);
    if (exportItem) {
      exportItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  public dispose(): void {
    this.group.dispose();
  }
}
