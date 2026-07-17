import * as path from 'path';
import { getPanoramicPreviewRoute } from '@neko/shared';

export type FileOpenViewer = 'default' | 'video' | 'audio' | 'panoramic-image' | 'panoramic-video';
export type NekoSettingsFileSource = 'personal' | 'project' | 'local';

export interface OpenFilePlan {
  cleanPath: string;
  viewer: FileOpenViewer;
}

export interface SaveDialogFilterPlan {
  name: string;
  extensions: string[];
}

export interface FileOperationFs {
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  access(path: string): Promise<void>;
  writeFile(path: string, content: string, encoding: 'utf-8'): Promise<void>;
}

export interface SvgDownloadPlan {
  defaultFileName: string;
  filters: SaveDialogFilterPlan[];
  content: string;
}

export interface FileOperationSuccessPlan {
  ok: true;
  filePath: string;
}

export interface EnsureFilePlan extends FileOperationSuccessPlan {
  dirPath: string;
  template: string;
}

export interface FileOperationFailurePlan {
  ok: false;
  error: string;
}

export type EnsureFileOperationResult =
  | {
      ok: true;
      filePath: string;
      created: boolean;
    }
  | FileOperationFailurePlan;

export type FileOperationPlan = FileOperationSuccessPlan | FileOperationFailurePlan;
export type EnsureFileOperationPlan = EnsureFilePlan | FileOperationFailurePlan;

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']);
const DEFAULT_SVG_DOWNLOAD_FILE_NAME = 'diagram.svg';

export const DEFAULT_NEKO_SETTINGS_TEMPLATE = `{
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": []
  }
}
`;

export function createOpenFilePlan(filePath: string): OpenFilePlan | null {
  if (!filePath) return null;

  const cleanPath = stripFileProtocol(filePath);
  return {
    cleanPath,
    viewer: detectFileOpenViewer(cleanPath),
  };
}

export function stripFileProtocol(filePath: string): string {
  return filePath.replace(/^file:\/\//, '');
}

export function detectFileOpenViewer(filePath: string): FileOpenViewer {
  const panoramicRoute = getPanoramicPreviewRoute({ filePath });
  if (panoramicRoute?.kind === 'image') return 'panoramic-image';
  if (panoramicRoute?.kind === 'video') return 'panoramic-video';

  const extension = path.extname(filePath).replace(/^\./, '').toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'default';
}

export function buildSvgDownloadPlan(input: {
  svg: string;
  filename?: string;
}): SvgDownloadPlan | null {
  if (!input.svg) return null;

  return {
    defaultFileName: input.filename || DEFAULT_SVG_DOWNLOAD_FILE_NAME,
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    content: input.svg,
  };
}

export function buildSvgDownloadSavedMessage(filePath: string): string {
  return `SVG saved to ${filePath}`;
}

export function buildSettingsFilePlan(input: {
  source: NekoSettingsFileSource;
  homeDir: string;
  workspaceRoot?: string;
}): EnsureFileOperationPlan {
  const basePath = resolveNekoBasePath({
    source:
      input.source === 'personal' ? 'personal' : input.source === 'local' ? 'local' : 'project',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (hasFileOperationError(basePath)) return { ok: false, error: basePath.error };

  const fileName = input.source === 'local' ? 'settings.local.json' : 'settings.json';
  return {
    ok: true,
    dirPath: basePath.filePath,
    filePath: path.join(basePath.filePath, fileName),
    template: DEFAULT_NEKO_SETTINGS_TEMPLATE,
  };
}

export async function ensureFileOperationPlan(input: {
  plan: EnsureFileOperationPlan;
  fs: FileOperationFs;
}): Promise<EnsureFileOperationResult> {
  const { plan, fs } = input;
  if (hasFileOperationError(plan)) return { ok: false, error: plan.error };

  try {
    await fs.mkdir(plan.dirPath, { recursive: true });

    try {
      await fs.access(plan.filePath);
      return { ok: true, filePath: plan.filePath, created: false };
    } catch {
      await fs.writeFile(plan.filePath, plan.template, 'utf-8');
      return { ok: true, filePath: plan.filePath, created: true };
    }
  } catch (error) {
    return {
      ok: false,
      error: `Failed to ensure file ${plan.filePath}: ${String(error)}`,
    };
  }
}

function hasFileOperationError(
  value: FileOperationPlan | EnsureFileOperationPlan | EnsureFileOperationResult,
): value is FileOperationFailurePlan {
  return 'error' in value;
}

export function buildConfigFilePath(homeDir: string): string {
  return path.join(homeDir, '.neko', 'config.toml');
}

function resolveNekoBasePath(input: {
  source: 'personal' | 'project' | 'local';
  homeDir: string;
  workspaceRoot?: string;
}): FileOperationPlan {
  if (input.source === 'personal') {
    return {
      ok: true,
      filePath: path.join(input.homeDir, '.neko'),
    };
  }

  if (!input.workspaceRoot) {
    return { ok: false, error: 'No workspace folder open' };
  }

  if (input.source === 'local') {
    return {
      ok: true,
      filePath: path.join(input.workspaceRoot, '.neko'),
    };
  }

  return {
    ok: true,
    filePath: path.join(input.workspaceRoot, 'neko'),
  };
}
