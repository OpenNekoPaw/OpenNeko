import * as vscode from 'vscode';
import {
  ENTITY_FACADE_COMMANDS,
  isEntityFacadeCommandError,
  isEntityFacadeTreeItem,
  type CreativeEntityKind,
  type EntityFacadeTreeItem,
} from '@neko/shared';

export type EntityBrowserTreeItem =
  | EntityBrowserGroupItem
  | EntityBrowserEntityItem
  | EntityBrowserUnavailableItem;

export type EntityBrowserTranslate = (
  message: string,
  ...args: readonly (string | number | boolean)[]
) => string;

export class EntityBrowserGroupItem extends vscode.TreeItem {
  constructor(
    public readonly kind: CreativeEntityKind | 'candidate',
    public readonly items: readonly EntityFacadeTreeItem[],
    translate: EntityBrowserTranslate = vscode.l10n.t,
  ) {
    super(labelForKind(kind, translate), vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${items.length}`;
    this.contextValue = 'entityBrowser:group';
    this.iconPath = new vscode.ThemeIcon(iconForKind(kind));
  }
}

export class EntityBrowserEntityItem extends vscode.TreeItem {
  constructor(
    public readonly item: EntityFacadeTreeItem,
    translate: EntityBrowserTranslate = vscode.l10n.t,
  ) {
    super(item.label, vscode.TreeItemCollapsibleState.None);
    this.description = item.status;
    this.tooltip = [item.label, item.summary, item.aliases?.join(', ')].filter(Boolean).join('\n');
    this.contextValue = item.entityRef ? 'entityBrowser:entity' : 'entityBrowser:candidate';
    this.iconPath = new vscode.ThemeIcon(
      item.status === 'deprecated' ? 'warning' : iconForKind(item.kind),
    );
    this.command = {
      command: 'neko.entityBrowser.inspect',
      title: translate('Inspect Entity'),
      arguments: [this],
    };
  }
}

export class EntityBrowserUnavailableItem extends vscode.TreeItem {
  constructor(message: string, translate: EntityBrowserTranslate = vscode.l10n.t) {
    super(translate('Entity source unavailable'), vscode.TreeItemCollapsibleState.None);
    this.description = message;
    this.contextValue = 'entityBrowser:unavailable';
    this.iconPath = new vscode.ThemeIcon('warning');
  }
}

export interface EntityBrowserTreeProviderOptions {
  readonly executeCommand?: typeof vscode.commands.executeCommand;
  readonly getProjectRoot?: () => string | undefined;
  readonly translate?: EntityBrowserTranslate;
}

export class EntityBrowserTreeProvider
  implements vscode.TreeDataProvider<EntityBrowserTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    EntityBrowserTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly executeCommand: typeof vscode.commands.executeCommand;
  private readonly getProjectRoot: () => string | undefined;
  private readonly translate: EntityBrowserTranslate;
  private cachedItems: readonly EntityFacadeTreeItem[] = [];
  private unavailableMessage: string | undefined;

  constructor(options: EntityBrowserTreeProviderOptions = {}) {
    this.executeCommand = options.executeCommand ?? vscode.commands.executeCommand;
    this.getProjectRoot =
      options.getProjectRoot ?? (() => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    this.translate = options.translate ?? vscode.l10n.t;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: EntityBrowserTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: EntityBrowserTreeItem): Promise<EntityBrowserTreeItem[]> {
    if (element instanceof EntityBrowserGroupItem) {
      return element.items.map((item) => new EntityBrowserEntityItem(item, this.translate));
    }
    if (element) return [];

    const items = await this.loadItems();
    if (this.unavailableMessage) {
      return [new EntityBrowserUnavailableItem(this.unavailableMessage, this.translate)];
    }
    const grouped = groupEntityTreeItems(items);
    return grouped.map(
      ([kind, entries]) => new EntityBrowserGroupItem(kind, entries, this.translate),
    );
  }

  async inspect(item: EntityBrowserEntityItem): Promise<unknown> {
    return this.executeCommand(ENTITY_FACADE_COMMANDS.inspectEntity, {
      ...(this.getProjectRoot() ? { projectRoot: this.getProjectRoot() } : {}),
      ...(item.item.entityRef ? { entityRef: item.item.entityRef } : {}),
      ...(item.item.candidateId ? { candidateId: item.item.candidateId } : {}),
      context: {
        surface: 'treeview',
        ...(this.getProjectRoot() ? { projectRoot: this.getProjectRoot() } : {}),
      },
    });
  }

  private async loadItems(): Promise<readonly EntityFacadeTreeItem[]> {
    const projectRoot = this.getProjectRoot();
    try {
      const [entities, candidates] = await Promise.all([
        this.executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listEntities, {
          ...(projectRoot ? { projectRoot } : {}),
        }),
        this.executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listCandidates, {
          ...(projectRoot ? { projectRoot } : {}),
          status: 'open',
        }),
      ]);
      if (isEntityFacadeCommandError(entities)) {
        this.unavailableMessage = entities.message;
        return [];
      }
      if (isEntityFacadeCommandError(candidates)) {
        this.unavailableMessage = candidates.message;
        return [];
      }
      const nextItems = [
        ...(Array.isArray(entities)
          ? entities.map((entity) => entityToTreeItem(entity, projectRoot))
          : []),
        ...(Array.isArray(candidates)
          ? candidates.map((candidate) => candidateToTreeItem(candidate, this.translate))
          : []),
      ].filter(isEntityFacadeTreeItem);
      this.unavailableMessage = undefined;
      this.cachedItems = nextItems;
      return nextItems;
    } catch (error) {
      this.unavailableMessage = error instanceof Error ? error.message : String(error);
      return this.cachedItems;
    }
  }
}

export function groupEntityTreeItems(
  items: readonly EntityFacadeTreeItem[],
): readonly (readonly [CreativeEntityKind | 'candidate', readonly EntityFacadeTreeItem[]])[] {
  const groups = new Map<CreativeEntityKind | 'candidate', EntityFacadeTreeItem[]>();
  for (const item of items) {
    const key = item.entityRef ? item.kind : 'candidate';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([kind, entries]) => [kind, entries.sort(compareEntityItems)] as const)
    .sort(([left], [right]) => groupRank(left) - groupRank(right) || left.localeCompare(right));
}

function entityToTreeItem(
  entity: unknown,
  projectRoot: string | undefined,
): EntityFacadeTreeItem | undefined {
  if (
    !isRecord(entity) ||
    typeof entity['id'] !== 'string' ||
    typeof entity['canonicalName'] !== 'string'
  ) {
    return undefined;
  }
  const kind = entity['kind'];
  if (!isCreativeEntityKind(kind)) return undefined;
  const status = entity['status'];
  if (status !== 'confirmed' && status !== 'candidate' && status !== 'deprecated') return undefined;
  const aliases = Array.isArray(entity['aliases'])
    ? entity['aliases'].filter((alias): alias is string => typeof alias === 'string')
    : [];
  return {
    id: `entity:${entity['id']}`,
    label:
      typeof entity['displayName'] === 'string' ? entity['displayName'] : entity['canonicalName'],
    kind,
    status,
    entityRef: {
      entityId: entity['id'],
      entityKind: kind,
      ...(projectRoot ? { projectRoot } : {}),
      source: 'neko-entity',
    },
    aliases,
    summary: readMetadataSummary(entity['metadata']),
  };
}

function candidateToTreeItem(
  candidate: unknown,
  translate: EntityBrowserTranslate,
): EntityFacadeTreeItem | undefined {
  if (
    !isRecord(candidate) ||
    typeof candidate['id'] !== 'string' ||
    typeof candidate['name'] !== 'string'
  ) {
    return undefined;
  }
  const kind = candidate['kind'];
  if (!isCreativeEntityKind(kind)) return undefined;
  const status = candidate['status'];
  if (
    status !== 'open' &&
    status !== 'confirmed' &&
    status !== 'rejected' &&
    status !== 'dismissed' &&
    status !== 'merged'
  ) {
    return undefined;
  }
  const identityBasis =
    candidate['identityBasis'] === 'placeholder' ||
    candidate['identityBasis'] === 'visual' ||
    candidate['identityBasis'] === 'asset'
      ? candidate['identityBasis']
      : 'user-named';
  const pendingName = identityBasis !== 'user-named';
  const candidateName = pendingName
    ? pendingCandidateLabel(candidate['name'], translate)
    : candidate['name'];
  return {
    id: `candidate:${candidate['id']}`,
    label: candidateName,
    kind,
    status,
    candidateId: candidate['id'],
    aliases: Array.isArray(candidate['aliases'])
      ? candidate['aliases'].filter((alias): alias is string => typeof alias === 'string')
      : [],
    summary: pendingName
      ? translate('Pending name · {0} candidate', identityBasis)
      : readMetadataSummary(candidate['metadata']),
  };
}

function pendingCandidateLabel(name: string, translate: EntityBrowserTranslate): string {
  return name.trim() ? translate('{0} (pending name)', name) : translate('Unnamed candidate');
}

function readMetadataSummary(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined;
  const value =
    metadata['appearanceSummary'] ?? metadata['visualSummary'] ?? metadata['appearanceNotes'];
  return typeof value === 'string' ? value : undefined;
}

function compareEntityItems(left: EntityFacadeTreeItem, right: EntityFacadeTreeItem): number {
  return left.status.localeCompare(right.status) || left.label.localeCompare(right.label);
}

function groupRank(kind: CreativeEntityKind | 'candidate'): number {
  return kind === 'candidate'
    ? 99
    : ['character', 'location', 'object', 'scene', 'style'].indexOf(kind);
}

function labelForKind(
  kind: CreativeEntityKind | 'candidate',
  translate: EntityBrowserTranslate,
): string {
  switch (kind) {
    case 'character':
      return translate('Characters');
    case 'location':
      return translate('Locations');
    case 'object':
      return translate('Objects');
    case 'scene':
      return translate('Scenes');
    case 'style':
      return translate('Styles');
    case 'candidate':
      return translate('Candidates');
  }
}

function iconForKind(kind: CreativeEntityKind | 'candidate'): string {
  switch (kind) {
    case 'character':
      return 'person';
    case 'location':
    case 'scene':
      return 'location';
    case 'object':
      return 'package';
    case 'style':
      return 'symbol-color';
    case 'candidate':
      return 'question';
  }
}

function isCreativeEntityKind(value: unknown): value is CreativeEntityKind {
  return (
    value === 'character' ||
    value === 'scene' ||
    value === 'object' ||
    value === 'location' ||
    value === 'style'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
