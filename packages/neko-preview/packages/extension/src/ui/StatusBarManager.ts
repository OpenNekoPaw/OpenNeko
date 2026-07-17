/**
 * StatusBarManager - VSCode status bar integration for media preview
 *
 * Displays playback state and media info in the bottom status bar.
 * Format: $(icon) filename | codec details | time / duration
 */

import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';

export interface StatusBarMediaInfo {
  fileName: string;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  duration: number;
}

export interface StatusBarDocumentInfo {
  fileName: string;
  format: string;
  /** Total pages (PDF/CBZ) or chapter count (EPUB) */
  pageCount?: number;
  /** Current page number */
  currentPage?: number;
  /** File size in bytes */
  fileSize?: number;
  /** Zoom percentage */
  zoom?: number;
}

type PlaybackState = 'playing' | 'paused' | 'stopped';

const ID = 'neko.preview.status';

export class StatusBarManager implements vscode.Disposable {
  private readonly group: StatusBarGroup;
  private _mediaInfo: StatusBarMediaInfo | null = null;
  private _documentInfo: StatusBarDocumentInfo | null = null;
  private _playbackState: PlaybackState = 'stopped';
  private _currentTime = 0;

  constructor() {
    this.group = new StatusBarGroup([
      { id: ID, alignment: vscode.StatusBarAlignment.Left, priority: 100 },
    ]);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  show(info: StatusBarMediaInfo): void {
    this._mediaInfo = info;
    this._documentInfo = null;
    this._playbackState = 'stopped';
    this._currentTime = 0;
    this.render();
    this.group.show();
  }

  showDocument(info: StatusBarDocumentInfo): void {
    this._documentInfo = info;
    this._mediaInfo = null;
    this.renderDocument();
    this.group.show();
  }

  updateDocumentPage(currentPage: number): void {
    if (this._documentInfo) {
      this._documentInfo.currentPage = currentPage;
      this.renderDocument();
    }
  }

  updateDocumentZoom(zoom: number): void {
    if (this._documentInfo) {
      this._documentInfo.zoom = zoom;
      this.renderDocument();
    }
  }

  hide(): void {
    this.group.hide();
    this._mediaInfo = null;
    this._documentInfo = null;
  }

  updatePlayback(state: PlaybackState, currentTime: number): void {
    this._playbackState = state;
    this._currentTime = currentTime;
    this.render();
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  private render(): void {
    if (!this._mediaInfo) return;

    const icon = this.getIcon();
    const details = this.buildDetails();
    const time = `${this.formatTime(this._currentTime)} / ${this.formatTime(this._mediaInfo.duration)}`;

    this.group.update(
      ID,
      `${icon} ${this._mediaInfo.fileName} | ${details} | ${time}`,
      `Neko Preview: ${this._mediaInfo.fileName}`,
    );
  }

  private getIcon(): string {
    switch (this._playbackState) {
      case 'playing':
        return '$(play)';
      case 'paused':
        return '$(debug-pause)';
      default:
        return '$(file-media)';
    }
  }

  private buildDetails(): string {
    const info = this._mediaInfo;
    if (!info) return 'Media';
    const parts: string[] = [];

    // Video info
    if (info.codec && info.width && info.height) {
      const resolution = `${info.width}x${info.height}`;
      const fps = info.fps ? ` ${Math.round(info.fps)}fps` : '';
      parts.push(`${info.codec.toUpperCase()} ${resolution}${fps}`);
    }

    // Audio info
    if (info.audioCodec) {
      const sr = info.audioSampleRate ? ` ${(info.audioSampleRate / 1000).toFixed(1)}kHz` : '';
      const ch =
        info.audioChannels === 1
          ? ' Mono'
          : info.audioChannels === 2
            ? ' Stereo'
            : info.audioChannels
              ? ` ${info.audioChannels}ch`
              : '';
      parts.push(`${info.audioCodec.toUpperCase()}${sr}${ch}`);
    }

    return parts.join(' | ') || 'Media';
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private renderDocument(): void {
    if (!this._documentInfo) return;
    const { fileName, format, pageCount, currentPage, fileSize, zoom } = this._documentInfo;

    const icon = this.getDocumentIcon(format);
    const parts: string[] = [format.toUpperCase()];

    if (currentPage != null && pageCount != null) {
      parts.push(`${currentPage} / ${pageCount}`);
    } else if (pageCount != null) {
      parts.push(`${pageCount} pages`);
    }

    if (fileSize != null) {
      parts.push(this.formatFileSize(fileSize));
    }

    if (zoom != null) {
      parts.push(`${Math.round(zoom)}%`);
    }

    this.group.update(
      ID,
      `${icon} ${fileName} | ${parts.join(' | ')}`,
      `Neko Preview: ${fileName}`,
    );
  }

  private getDocumentIcon(format: string): string {
    switch (format.toLowerCase()) {
      case 'pdf':
        return '$(file-pdf)';
      case 'epub':
        return '$(book)';
      case 'cbz':
        return '$(file-media)';
      case 'docx':
        return '$(file-text)';
      default:
        return '$(file)';
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this.group.dispose();
  }
}
