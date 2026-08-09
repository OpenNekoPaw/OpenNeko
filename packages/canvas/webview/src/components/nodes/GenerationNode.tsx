import {
  purposeForCanvasGenerationKind,
  selectedCanvasGenerationOutput,
  type CanvasGenerationRecipe,
  type GenerationCanvasNode,
} from '@neko/canvas-domain';
import { PlayIcon, StopIcon } from '@neko/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useOptionalCanvasHost } from '../../host-runtime';
import { t } from '../../i18n';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';
import { BaseNode } from './BaseNode';
import type { NodeRendererCommonProps } from './nodeRendererTypes';

type GenerationNodeProps = NodeRendererCommonProps & { readonly node: GenerationCanvasNode };

export function GenerationNode({ node, isSelected, ...baseProps }: GenerationNodeProps) {
  const host = useOptionalCanvasHost();
  const [recipe, setRecipe] = useState<CanvasGenerationRecipe>(node.data.recipe);
  useEffect(() => setRecipe(node.data.recipe), [node.data.recipe]);
  const projection = host?.getGenerationProjection(node.id);
  const selected = selectedCanvasGenerationOutput(node.data);
  const active =
    projection?.phase === 'binding' ||
    projection?.phase === 'pending' ||
    projection?.phase === 'running';
  const title = t(`generation.kind.${recipe.kind}`);
  const previewSource = useMemo<PreviewSourceDescriptor | undefined>(() => {
    if (!selected || selected.kind === 'prompt') return undefined;
    return {
      id: `canvas-generation:${node.id}:${selected.outputId}`,
      role:
        selected.kind === 'image'
          ? 'image'
          : selected.kind === 'video'
            ? 'video-proxy'
            : 'audio-waveform',
      title,
      asset: { kind: 'asset-identity', mediaType: selected.kind },
      contentLocator: selected.locator,
      metadata: {},
    };
  }, [node.id, selected, title]);

  const commitRecipe = async (next = recipe): Promise<void> => {
    if (!host) throw new Error('Canvas Generation Host is unavailable.');
    await host.updateGenerationRecipe(node.id, next);
  };

  const setModelField = (field: 'providerId' | 'modelId', value: string): void => {
    setRecipe((currentRecipe) => ({
      ...currentRecipe,
      model: {
        ...(currentRecipe.model ?? {
          purpose: purposeForCanvasGenerationKind(currentRecipe.kind),
          providerId: '',
          modelId: '',
        }),
        [field]: value,
      },
    }));
  };

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
    >
      <div className="flex h-full min-h-0 flex-col" data-canvas-generation-node={recipe.kind}>
        <div
          className="flex items-center justify-between border-b px-2 py-1.5"
          style={{ borderColor: 'var(--node-divider)' }}
        >
          <strong className="truncate text-xs" style={{ color: 'var(--node-fg)' }}>
            {title}
          </strong>
          <span className="text-[10px]" style={{ color: 'var(--node-fg-secondary)' }}>
            {projection ? t(`generation.phase.${projection.phase}`) : t('generation.phase.idle')}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {recipe.kind === 'prompt' ? (
            <div
              className="h-full overflow-auto whitespace-pre-wrap p-2 text-xs leading-5"
              style={{ color: 'var(--node-fg)' }}
            >
              {node.data.authoredText?.text ??
                projection?.text ??
                (selected ? t('generation.textUnavailable') : t('generation.empty'))}
            </div>
          ) : previewSource ? (
            <PreviewSurface
              source={previewSource}
              surfaceKind="inline"
              chrome="full-bleed"
              audioLayout={recipe.kind === 'audio' ? 'node-card' : undefined}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center px-3 text-center text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
            >
              {t('generation.empty')}
            </div>
          )}
        </div>

        {isSelected ? (
          <div
            className="space-y-1.5 border-t p-2"
            style={{ borderColor: 'var(--node-divider)' }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <textarea
              aria-label={t('generation.prompt')}
              className="h-14 w-full resize-none rounded border bg-transparent p-1.5 text-xs outline-none"
              style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
              placeholder={t('generation.promptPlaceholder')}
              value={recipe.prompt}
              onChange={(event) => {
                const prompt = event.currentTarget.value;
                setRecipe((currentRecipe) => ({ ...currentRecipe, prompt }));
              }}
              onBlur={() => void commitRecipe()}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                aria-label={t('generation.provider')}
                className="min-w-0 rounded border bg-transparent px-1.5 py-1 text-xs outline-none"
                style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
                placeholder={t('generation.provider')}
                value={recipe.model?.providerId ?? ''}
                onChange={(event) => setModelField('providerId', event.currentTarget.value)}
                onBlur={() => void commitRecipe()}
              />
              <input
                aria-label={t('generation.model')}
                className="min-w-0 rounded border bg-transparent px-1.5 py-1 text-xs outline-none"
                style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
                placeholder={t('generation.model')}
                value={recipe.model?.modelId ?? ''}
                onChange={(event) => setModelField('modelId', event.currentTarget.value)}
                onBlur={() => void commitRecipe()}
              />
            </div>
            <KindParameters recipe={recipe} onChange={setRecipe} onCommit={commitRecipe} />
            {node.data.outputs.length > 0 ? (
              <select
                aria-label={t('generation.outputHistory')}
                className="w-full rounded border bg-transparent px-1.5 py-1 text-xs"
                style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
                value={node.data.selectedOutputId}
                onChange={(event) =>
                  void host?.selectGenerationOutput(node.id, event.currentTarget.value)
                }
              >
                {node.data.outputs.map((output, index) => (
                  <option key={output.outputId} value={output.outputId}>
                    {t('generation.output', { number: index + 1 })}
                  </option>
                ))}
              </select>
            ) : null}
            {projection?.diagnostic ? (
              <div
                className="text-[10px] leading-4"
                role="alert"
                style={{ color: 'var(--hostPort-errorForeground)' }}
              >
                {projection.diagnostic.message}
              </div>
            ) : null}
            {projection?.recipeStale ? (
              <div
                className="text-[10px] leading-4"
                data-canvas-generation-recipe-stale="true"
                style={{ color: 'var(--hostPort-warningForeground)' }}
              >
                {t('generation.recipeStale')}
              </div>
            ) : null}
            <div className="flex justify-end">
              <button
                className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs"
                style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
                type="button"
                title={active ? t('generation.cancel') : t('generation.run')}
                onClick={() =>
                  void (async () => {
                    if (!host) return;
                    if (active) await host.cancelGenerationNode(node.id);
                    else {
                      await commitRecipe();
                      await host.runGenerationNode(node.id);
                    }
                  })()
                }
              >
                {active ? <StopIcon size={12} /> : <PlayIcon size={12} />}
                {active ? t('generation.cancel') : t('generation.run')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
}

function KindParameters({
  recipe,
  onChange,
  onCommit,
}: {
  readonly recipe: CanvasGenerationRecipe;
  readonly onChange: (recipe: CanvasGenerationRecipe) => void;
  readonly onCommit: (recipe?: CanvasGenerationRecipe) => Promise<void>;
}) {
  const numeric = (
    label: string,
    value: number | undefined,
    update: (value: number | undefined) => CanvasGenerationRecipe,
  ) => (
    <input
      aria-label={label}
      className="min-w-0 rounded border bg-transparent px-1.5 py-1 text-xs outline-none"
      style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
      type="number"
      placeholder={label}
      value={value ?? ''}
      onChange={(event) =>
        onChange(update(event.currentTarget.value ? Number(event.currentTarget.value) : undefined))
      }
      onBlur={() => void onCommit()}
    />
  );
  switch (recipe.kind) {
    case 'prompt':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {numeric(t('generation.temperature'), recipe.temperature, (temperature) => ({
            ...recipe,
            temperature,
          }))}
          {numeric(t('generation.maxTokens'), recipe.maxOutputTokens, (maxOutputTokens) => ({
            ...recipe,
            maxOutputTokens,
          }))}
        </div>
      );
    case 'image':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          <input
            aria-label={t('generation.aspectRatio')}
            className="min-w-0 rounded border bg-transparent px-1.5 py-1 text-xs"
            style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
            placeholder={t('generation.aspectRatio')}
            value={recipe.aspectRatio ?? ''}
            onChange={(event) =>
              onChange({ ...recipe, aspectRatio: event.currentTarget.value || undefined })
            }
            onBlur={() => void onCommit()}
          />
          {numeric(t('generation.count'), recipe.count, (count) => ({ ...recipe, count }))}
        </div>
      );
    case 'video':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {numeric(t('generation.duration'), recipe.duration, (duration) => ({
            ...recipe,
            duration,
          }))}
          <input
            aria-label={t('generation.resolution')}
            className="min-w-0 rounded border bg-transparent px-1.5 py-1 text-xs"
            style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
            placeholder={t('generation.resolution')}
            value={recipe.resolution ?? ''}
            onChange={(event) =>
              onChange({ ...recipe, resolution: event.currentTarget.value || undefined })
            }
            onBlur={() => void onCommit()}
          />
        </div>
      );
    case 'audio':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {numeric(t('generation.duration'), recipe.duration, (duration) => ({
            ...recipe,
            duration,
          }))}
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--node-fg)' }}>
            <input
              type="checkbox"
              checked={recipe.isMusic ?? false}
              onChange={(event) => {
                const next = { ...recipe, isMusic: event.currentTarget.checked };
                onChange(next);
                void onCommit(next);
              }}
            />
            {t('generation.music')}
          </label>
        </div>
      );
  }
}
