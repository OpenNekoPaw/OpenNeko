import * as path from 'node:path';

export function resolveDesktopRendererAsset(rendererRoot: string, requestPath: string): string {
  if (requestPath.includes('\0')) {
    throw new Error('Desktop renderer asset path contains a null byte.');
  }
  const absoluteRoot = path.resolve(rendererRoot);
  const relativeRequest = requestPath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(absoluteRoot, relativeRequest);
  const relative = path.relative(absoluteRoot, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error(`Desktop renderer asset escapes its root: '${requestPath}'.`);
}
