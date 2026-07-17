/**
 * ShaderInstallTarget — contributed target for shader packages.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetManifest, IInstallTarget } from '@neko/shared';

const MARKET_SHADERS_BASE = path.join(os.homedir(), '.neko', 'shaders');

export class ShaderInstallTarget implements IInstallTarget<'shader'> {
  readonly type = 'shader' as const;

  validateManifest(manifest: AssetManifest): void {
    if (manifest.type !== 'shader') {
      throw new Error(`ShaderInstallTarget cannot install asset type: ${manifest.type}`);
    }
    if (manifest.typeMetadata?.type !== 'shader') {
      throw new Error('shader packages must include shader typeMetadata');
    }
  }

  getInstallPath(manifest: AssetManifest): string {
    const publisherId = manifest.distribution?.publisherId ?? 'unknown';
    const shaderKind =
      manifest.typeMetadata?.type === 'shader'
        ? manifest.typeMetadata.data.shaderKind
        : 'standalone';
    return path.join(MARKET_SHADERS_BASE, shaderKind, publisherId, manifest.name);
  }
}
