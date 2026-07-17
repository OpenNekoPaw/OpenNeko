/**
 * BaseOutlineProvider - Abstract base for TreeDataProvider-based outlines
 *
 * Provides common boilerplate for outline providers used in custom editors
 * where data is pushed from webview rather than parsed from text documents.
 *
 * @example
 * ```typescript
 * import { BaseOutlineProvider } from '@neko/shared/vscode/extension';
 *
 * class MyOutline extends BaseOutlineProvider<MyElement, MyData> {
 *   getTreeItem(element: MyElement): vscode.TreeItem { ... }
 *   getChildren(element?: MyElement): MyElement[] { ... }
 * }
 * ```
 */
import * as vscode from 'vscode';

/**
 * Interface for outline providers that receive data from custom editors.
 * Consumers should program to this interface, not the base class.
 */
export interface IOutlineProvider<TElement, TData> extends vscode.TreeDataProvider<TElement> {
  /** Push new data snapshot (null to clear) */
  updateData(data: TData | null): void;
  /** Whether the provider currently has data to display */
  hasData(): boolean;
  /** Force a full refresh of the tree view */
  refresh(): void;
  /** Dispose resources */
  dispose(): void;
}

/**
 * Abstract base class implementing common outline provider boilerplate.
 *
 * Subclasses MUST implement:
 * - getTreeItem(element): vscode.TreeItem
 * - getChildren(element?): TElement[]
 *
 * Subclasses MAY override:
 * - getParent(element): TElement | null
 * - onDataUpdated(data): void  (hook after data is set, before refresh)
 */
export abstract class BaseOutlineProvider<TElement, TData> implements IOutlineProvider<
  TElement,
  TData
> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TElement | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected data: TData | null = null;

  // --- Public API ---

  updateData(data: TData | null): void {
    this.data = data;
    this.onDataUpdated(data);
    this._onDidChangeTreeData.fire();
  }

  hasData(): boolean {
    return this.data !== null;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  // --- Abstract methods (domain-specific) ---

  abstract getTreeItem(element: TElement): vscode.TreeItem;
  abstract getChildren(element?: TElement): TElement[] | Promise<TElement[]>;

  // --- Optional overrides ---

  getParent(_element: TElement): vscode.ProviderResult<TElement> {
    return undefined;
  }

  /**
   * Hook called after data is updated but before the tree fires refresh.
   * Override for side effects like cache invalidation.
   */
  protected onDataUpdated(_data: TData | null): void {
    // no-op by default
  }
}
