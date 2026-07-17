/**
 * JVI Hover Provider — Show media metadata on hover over `src` values.
 *
 * When the cursor hovers over a "src" string in a .nkv file, probes the
 * referenced media file via EngineMediaService and displays a Markdown tooltip
 * with resolution, duration, codec, FPS, bitrate, and audio info.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';
import { findSrcNodeAtOffset } from '../services/JviParser';
import type { IMediaProbeCache, ProbeResultLike } from '../services/types';
import type { IEngineMediaService } from '../../contracts/IEngineMediaService';
import { resolveMediaSrcPath } from '../services/resolveMediaSrcPath';

export class JviHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly engineService: IEngineMediaService | undefined,
    private readonly probeCache: IMediaProbeCache,
    private readonly workspaceIO: IWorkspaceIO,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    const text = document.getText();
    const offset = document.offsetAt(position);

    const srcNode = findSrcNodeAtOffset(text, offset);
    if (!srcNode) return null;

    const jviDir = path.dirname(document.uri.fsPath);
    const absolutePath = await resolveMediaSrcPath(jviDir, srcNode.value);

    // Build hover content
    const lines: string[] = [`**Media:** \`${srcNode.value}\``];

    // Try to probe metadata
    const probeResult = await this.probeFile(absolutePath);
    if (probeResult) {
      lines.push('', '| Property | Value |', '|----------|-------|');

      if (probeResult.width > 0 && probeResult.height > 0) {
        lines.push(`| Resolution | ${probeResult.width}×${probeResult.height} |`);
      }
      if (probeResult.duration > 0) {
        lines.push(`| Duration | ${formatDuration(probeResult.duration)} |`);
      }
      if (probeResult.codec) {
        lines.push(`| Codec | ${probeResult.codec} |`);
      }
      if (probeResult.fps > 0) {
        lines.push(`| FPS | ${probeResult.fps} |`);
      }
      if (probeResult.format) {
        lines.push(`| Format | ${probeResult.format} |`);
      }
      if (probeResult.bitrate && probeResult.bitrate > 0) {
        lines.push(`| Bitrate | ${formatBitrate(probeResult.bitrate)} |`);
      }
      if (probeResult.hasAudio) {
        const audioInfo = [probeResult.audioCodec ?? 'unknown'].filter(Boolean);
        if (probeResult.audioSampleRate) {
          audioInfo.push(`${probeResult.audioSampleRate} Hz`);
        }
        if (probeResult.audioChannels) {
          audioInfo.push(`${probeResult.audioChannels}ch`);
        }
        lines.push(`| Audio | ${audioInfo.join(', ')} |`);
      }
    } else {
      // Check if file exists
      try {
        await this.workspaceIO.stat(vscode.Uri.file(absolutePath));
        lines.push('', '*Engine unavailable — cannot probe metadata*');
      } catch {
        lines.push('', '*File not found*');
      }
    }

    const range = new vscode.Range(
      new vscode.Position(srcNode.range.startLine, srcNode.range.startChar),
      new vscode.Position(srcNode.range.endLine, srcNode.range.endChar),
    );

    return new vscode.Hover(new vscode.MarkdownString(lines.join('\n')), range);
  }

  private async probeFile(absolutePath: string): Promise<ProbeResultLike | null> {
    const cached = this.probeCache.get(absolutePath);
    if (cached) return cached;

    if (!this.engineService) return null;

    try {
      const result = await this.engineService.probe('videos', absolutePath);
      if (result) {
        this.probeCache.set(absolutePath, result as ProbeResultLike);
        return result as ProbeResultLike;
      }
    } catch {
      // Probe failed
    }

    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toFixed(0)}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${s.toFixed(0)}s`;
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}
