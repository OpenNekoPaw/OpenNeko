import type { CanvasNode, CanvasViewport, RegisteredCanvasNode } from '@neko/shared';
import { BaseNode } from '../../components/nodes/BaseNode';
import type {
  NodeRendererCommonProps,
  NodeRendererContext,
  NodeRendererRegistry,
} from '../../components/nodes';
import { t } from '../../i18n';

type NarrativeNode = RegisteredCanvasNode & { data: Record<string, unknown> };

interface NarrativeNodeProps
  extends NodeRendererCommonProps, Pick<NodeRendererContext, 'onScriptOpen'> {
  node: CanvasNode;
}

export function createNarrativeNodeRendererRegistry(): NodeRendererRegistry {
  return {
    'narrative-start': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    choice: (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    merge: (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    'narrative-scene': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    'narrative-note': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
    'narrative-ending': (context) => <NarrativeNodeCard key={context.node.id} {...context} />,
  };
}

function NarrativeNodeCard({
  node,
  viewport,
  isSelected,
  containerRef,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onRotate,
  onRotateEnd,
  onConnectionStart,
  onUpdateData,
  onScriptOpen,
}: NarrativeNodeProps) {
  const narrativeNode = node as NarrativeNode;
  const title = readTitle(narrativeNode);
  const detail = readDetail(narrativeNode);
  const sceneRef = node.type === 'narrative-scene' ? readSceneRef(narrativeNode) : undefined;
  const canOpenScene = sceneRef !== undefined && isFountainSceneRef(sceneRef);
  const openScene = () => {
    if (canOpenScene) {
      onScriptOpen?.(sceneRef);
    }
  };

  return (
    <BaseNode
      node={node}
      viewport={viewport as CanvasViewport}
      isSelected={isSelected}
      containerRef={containerRef}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onRotate={onRotate}
      onRotateEnd={onRotateEnd}
      onConnectionStart={onConnectionStart}
    >
      <div
        className="flex h-full flex-col"
        onDoubleClick={(event) => {
          if (canOpenScene) {
            event.stopPropagation();
            openScene();
          }
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-2 py-1.5"
          style={{
            backgroundColor: 'var(--node-header-bg)',
            borderColor: 'var(--node-divider)',
          }}
        >
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${colorForType(node.type)}20`,
              color: colorForType(node.type),
            }}
          >
            {tagForType(node.type)}
          </span>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-0 text-xs font-medium"
            value={title}
            aria-label={t('panel.title')}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdateData?.(node.id, titleUpdateForType(node.type, event.target.value))
            }
            onDoubleClick={(event) => {
              if (canOpenScene) {
                event.stopPropagation();
                openScene();
              }
            }}
          />
        </div>
        {node.type === 'narrative-scene' ? (
          <NarrativeSceneSummary
            nodeId={node.id}
            detail={detail}
            sceneRef={sceneRef}
            canOpenScene={canOpenScene}
            onOpenScene={openScene}
            onUpdateData={onUpdateData}
          />
        ) : (
          <textarea
            className="m-2 min-h-0 flex-1 resize-none rounded border px-2 py-1 text-xs"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
            }}
            value={detail}
            aria-label={t('panel.description')}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdateData?.(node.id, detailUpdateForType(node.type, event.target.value))
            }
          />
        )}
      </div>
    </BaseNode>
  );
}

function NarrativeSceneSummary({
  nodeId,
  detail,
  sceneRef,
  canOpenScene,
  onOpenScene,
  onUpdateData,
}: {
  readonly nodeId: string;
  readonly detail: string;
  readonly sceneRef: string | undefined;
  readonly canOpenScene: boolean;
  readonly onOpenScene: () => void;
  readonly onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const status = getSceneRefStatus(sceneRef);

  return (
    <div
      className="m-2 flex min-h-0 flex-1 flex-col gap-2"
      onDoubleClick={(event) => {
        if (canOpenScene) {
          event.stopPropagation();
          onOpenScene();
        }
      }}
    >
      <div
        className="rounded border px-2 py-1.5 text-xs"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: status === 'ready' ? '#0ea5e9' : '#f97316',
          color: 'var(--control-fg)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase opacity-70">
              {t('narrative.scene.sceneRef')}
            </div>
            <div className="truncate font-medium" title={sceneRef ?? undefined}>
              {sceneRef ?? t('narrative.scene.missingRef')}
            </div>
            {status === 'invalid' ? (
              <div className="mt-1 text-[10px] opacity-75">{t('narrative.scene.invalidRef')}</div>
            ) : null}
          </div>
          {canOpenScene ? (
            <button
              type="button"
              className="shrink-0 rounded border px-2 py-1 text-[10px] font-medium"
              style={{
                backgroundColor: 'var(--button-bg, var(--control-bg))',
                borderColor: 'var(--control-border)',
                color: 'var(--button-fg, var(--control-fg))',
              }}
              aria-label={t('narrative.scene.openFountain')}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenScene();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {t('narrative.scene.openFountain')}
            </button>
          ) : null}
        </div>
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none rounded border px-2 py-1 text-xs"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
        }}
        value={detail}
        aria-label={t('panel.description')}
        placeholder={t('panel.description')}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => onUpdateData?.(nodeId, { summary: event.target.value })}
      />
    </div>
  );
}

function readTitle(node: NarrativeNode): string {
  if (node.type === 'narrative-start') return readString(node.data.label, t('node.narrativeStart'));
  if (node.type === 'narrative-scene') return readString(node.data.title, t('node.narrativeScene'));
  if (node.type === 'narrative-ending') {
    return readString(node.data.endingLabel ?? node.data.label, t('node.narrativeEnding'));
  }
  if (node.type === 'narrative-note') return t('node.narrativeNote');
  return readString(node.data.label ?? node.data.name, node.type);
}

function readDetail(node: NarrativeNode): string {
  if (node.type === 'narrative-start') return readString(node.data.description, '');
  if (node.type === 'narrative-scene') return readString(node.data.summary, '');
  if (node.type === 'narrative-ending') return readString(node.data.summary, '');
  if (node.type === 'narrative-note') return readString(node.data.content, '');
  if (node.type === 'choice') return readString(node.data.condition, '');
  return readString(node.data.description, '');
}

function titleUpdateForType(type: string, value: string): Record<string, unknown> {
  if (type === 'narrative-start') return { label: value };
  if (type === 'narrative-scene') return { title: value };
  if (type === 'narrative-ending') return { endingLabel: value };
  if (type === 'merge') return { label: value };
  if (type === 'choice') return { label: value };
  return { label: value };
}

function detailUpdateForType(type: string, value: string): Record<string, unknown> {
  if (type === 'narrative-start') return { description: value };
  if (type === 'narrative-scene') return { summary: value };
  if (type === 'narrative-ending') return { summary: value };
  if (type === 'narrative-note') return { content: value };
  if (type === 'choice') return { condition: value };
  return { description: value };
}

function tagForType(type: string): string {
  switch (type) {
    case 'narrative-start':
      return 'START';
    case 'choice':
      return 'CHOICE';
    case 'merge':
      return 'MERGE';
    case 'narrative-scene':
      return 'SCENE';
    case 'narrative-ending':
      return 'ENDING';
    default:
      return 'NOTE';
  }
}

function colorForType(type: string): string {
  switch (type) {
    case 'narrative-start':
      return '#22c55e';
    case 'choice':
      return '#f97316';
    case 'merge':
      return '#22c55e';
    case 'narrative-scene':
      return '#0ea5e9';
    case 'narrative-ending':
      return '#ef4444';
    default:
      return '#a855f7';
  }
}

function readString(value: unknown, defaultValue: string): string {
  return typeof value === 'string' ? value : defaultValue;
}

function readSceneRef(node: NarrativeNode): string | undefined {
  const value = node.data.sceneRef;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isFountainSceneRef(sceneRef: string): boolean {
  return sceneRef.toLowerCase().endsWith('.fountain');
}

function getSceneRefStatus(sceneRef: string | undefined): 'missing' | 'invalid' | 'ready' {
  if (!sceneRef) return 'missing';
  return isFountainSceneRef(sceneRef) ? 'ready' : 'invalid';
}
