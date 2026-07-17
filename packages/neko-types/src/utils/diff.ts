/**
 * Text Diff Utilities
 *
 * Pure line-level diff algorithm using Longest Common Subsequence (LCS).
 * No framework dependencies — usable in webview, CLI, and Node.js contexts.
 *
 * Layer 0: Zero dependencies.
 */

export type DiffLineType = 'add' | 'remove' | 'context';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffStats {
  added: number;
  removed: number;
}

/**
 * Compute Longest Common Subsequence of two string arrays.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // dp is fully initialized above; rows always exist
      const row = dp[i]!;
      if (a[i - 1] === b[j - 1]) {
        row[j] = (dp[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(dp[i - 1]?.[j] ?? 0, row[j - 1] ?? 0);
      }
    }
  }

  const lcs: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1] ?? '');
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Compute line-level diff between two text strings using LCS.
 *
 * @example
 * const lines = computeDiff('foo\nbar', 'foo\nbaz');
 * // [{ type: 'context', content: 'foo', ... }, { type: 'remove', content: 'bar', ... }, { type: 'add', content: 'baz', ... }]
 */
export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: DiffLine[] = [];

  const lcs = computeLCS(oldLines, newLines);

  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    const lcsLine = lcs[lcsIdx];

    if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLine === lcsLine) {
      if (newIdx < newLines.length && newLine === lcsLine) {
        // Context line (unchanged)
        result.push({
          type: 'context',
          content: oldLine ?? '',
          oldLineNum: oldIdx + 1,
          newLineNum: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else {
        // New line added before context
        result.push({
          type: 'add',
          content: newLine ?? '',
          newLineNum: newIdx + 1,
        });
        newIdx++;
      }
    } else if (oldIdx < oldLines.length && (lcsIdx >= lcs.length || oldLine !== lcsLine)) {
      // Old line removed
      result.push({
        type: 'remove',
        content: oldLine ?? '',
        oldLineNum: oldIdx + 1,
      });
      oldIdx++;
    } else if (newIdx < newLines.length) {
      // New line added
      result.push({
        type: 'add',
        content: newLine ?? '',
        newLineNum: newIdx + 1,
      });
      newIdx++;
    }
  }

  return result;
}

/**
 * Compute added/removed line counts from a diff result.
 */
export function computeDiffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
  }
  return { added, removed };
}
