export interface MediaExecutablePaths {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

export type OpenNekoMediaTarget = 'darwin-arm64' | 'linux-x64';

export function installVerifiedMediaRuntimePaths(
  environment: NodeJS.ProcessEnv,
  executables: MediaExecutablePaths,
): void {
  environment['NEKO_FFMPEG_PATH'] = executables.ffmpeg;
  environment['NEKO_FFPROBE_PATH'] = executables.ffprobe;
}

export function resolveMediaRuntimeTarget(
  platform = process.platform,
  arch = process.arch,
): OpenNekoMediaTarget {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  throw new Error(`OpenNeko media runtime does not support ${platform}-${arch}.`);
}
