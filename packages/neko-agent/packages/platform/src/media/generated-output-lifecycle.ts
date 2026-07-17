import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratedAsset } from '@neko/shared';

export interface GeneratedOutputReferenceInspector {
  findReferences(asset: GeneratedAsset): Promise<readonly string[]>;
}

export interface GeneratedOutputLifecycleIndex {
  get(id: string): GeneratedAsset | undefined;
  add(asset: GeneratedAsset): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export type GeneratedOutputLifecycleResult =
  | { readonly status: 'retained'; readonly assetId: string }
  | { readonly status: 'deleted'; readonly assetId: string; readonly fileMissing: boolean }
  | {
      readonly status: 'rejected';
      readonly assetId: string;
      readonly code:
        | 'generated-output-not-found'
        | 'reference-check-unavailable'
        | 'generated-output-referenced'
        | 'generated-output-path-invalid';
      readonly message: string;
      readonly references?: readonly string[];
    };

export class GeneratedOutputLifecycleService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly index: GeneratedOutputLifecycleIndex,
  ) {}

  retain(assetId: string): GeneratedOutputLifecycleResult {
    return this.index.get(assetId)
      ? { status: 'retained', assetId }
      : {
          status: 'rejected',
          assetId,
          code: 'generated-output-not-found',
          message: `Generated output ${assetId} is not registered.`,
        };
  }

  async delete(
    assetId: string,
    referenceInspector?: GeneratedOutputReferenceInspector,
  ): Promise<GeneratedOutputLifecycleResult> {
    const asset = this.index.get(assetId);
    if (!asset) return this.rejectedNotFound(assetId);
    if (!referenceInspector) {
      return {
        status: 'rejected',
        assetId,
        code: 'reference-check-unavailable',
        message: 'Generated output deletion requires a complete project reference check.',
      };
    }
    if (!isInsideGeneratedOutputRoot(this.workspaceRoot, asset.path)) {
      return {
        status: 'rejected',
        assetId,
        code: 'generated-output-path-invalid',
        message: 'Generated output deletion is limited to workspace neko/generated files.',
      };
    }

    const references = await referenceInspector.findReferences(asset);
    if (references.length > 0) {
      return {
        status: 'rejected',
        assetId,
        code: 'generated-output-referenced',
        message: `Generated output ${assetId} is still referenced.`,
        references,
      };
    }

    if (!(await this.index.remove(assetId))) return this.rejectedNotFound(assetId);
    try {
      await fs.unlink(asset.path);
      return { status: 'deleted', assetId, fileMissing: false };
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT')) {
        return { status: 'deleted', assetId, fileMissing: true };
      }
      await this.index.add(asset);
      throw error;
    }
  }

  private rejectedNotFound(assetId: string): GeneratedOutputLifecycleResult {
    return {
      status: 'rejected',
      assetId,
      code: 'generated-output-not-found',
      message: `Generated output ${assetId} is not registered.`,
    };
  }
}

function isInsideGeneratedOutputRoot(workspaceRoot: string, filePath: string): boolean {
  const generatedRoot = path.resolve(workspaceRoot, 'neko', 'generated');
  const relative = path.relative(generatedRoot, path.resolve(filePath));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
