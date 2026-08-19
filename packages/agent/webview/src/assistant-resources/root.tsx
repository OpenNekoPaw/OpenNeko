import type {
  AssistantResourceProjection,
  AssistantResourceRuntime,
} from '@neko/agent-contracts/assistant-resource-host';
import { EyeIcon, FileIcon, FolderIcon, WarningIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useState } from 'react';

export function AssistantResourcesRoot({
  assistantSpaceId,
  locale,
  runtime,
}: {
  readonly assistantSpaceId: string;
  readonly locale: SupportedLocale;
  readonly runtime?: AssistantResourceRuntime;
}): JSX.Element {
  const [projection, setProjection] = useState<AssistantResourceProjection>();
  const [error, setError] = useState<string>();
  const [pendingArtifactId, setPendingArtifactId] = useState<string>();

  useEffect(() => {
    setProjection(undefined);
    setError(undefined);
    if (!runtime) return;
    let active = true;
    void runtime.getSnapshot().then(
      (next) => {
        if (active) setProjection(next);
      },
      (reason: unknown) => {
        if (active) setError(describeError(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [runtime]);

  const preview = async (scratchArtifactId: string): Promise<void> => {
    setPendingArtifactId(scratchArtifactId);
    setError(undefined);
    try {
      await runtime?.authorizeScratchPreview(scratchArtifactId);
    } catch (reason: unknown) {
      setError(describeError(reason));
    } finally {
      setPendingArtifactId(undefined);
    }
  };

  return (
    <section
      className="assistant-resources-root"
      data-assistant-resources-root={assistantSpaceId}
      data-assistant-resources-phase={runtime ? 'session' : 'draft'}
      aria-label={label(locale, '助手资源', 'Assistant resources')}
    >
      <header className="management-surface-header">
        <div>
          <p className="section-label">{label(locale, '助手', 'Assistant')}</p>
          <h2>{label(locale, '资源', 'Resources')}</h2>
        </div>
      </header>
      {error ? (
        <div className="management-surface-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error}</span>
        </div>
      ) : null}
      {!runtime ? (
        <div className="management-surface-empty">
          <FolderIcon size={20} />
          <span>{label(locale, '新会话尚无资源', 'No resources in this new conversation')}</span>
        </div>
      ) : !projection ? (
        <div className="management-surface-empty">
          <span>{label(locale, '正在载入资源...', 'Loading resources...')}</span>
        </div>
      ) : projection.baseGrants.length === 0 && projection.scratchArtifacts.length === 0 ? (
        <div className="management-surface-empty">
          <FolderIcon size={20} />
          <span>{label(locale, '此会话暂无资源', 'No conversation resources')}</span>
        </div>
      ) : (
        <div className="management-surface-list">
          {projection.baseGrants.map((grant) => (
            <article className="management-surface-row" key={grant.resourceGrantId}>
              <span className="management-surface-icon">
                {grant.kind === 'directory' ? <FolderIcon size={18} /> : <FileIcon size={18} />}
              </span>
              <span className="management-surface-copy">
                <strong>{grant.label}</strong>
                <small>{label(locale, '已授权', 'Authorized')}</small>
              </span>
            </article>
          ))}
          {projection.scratchArtifacts.map((artifact) => (
            <article className="management-surface-row" key={artifact.scratchArtifactId}>
              <span className="management-surface-icon">
                <FileIcon size={18} />
              </span>
              <span className="management-surface-copy">
                <strong>{artifact.label}</strong>
                <small>
                  {artifact.state === 'published'
                    ? label(locale, '已发布', 'Published')
                    : label(locale, '临时文件', 'Scratch')}
                </small>
              </span>
              <span className="management-surface-row-actions">
                <button
                  type="button"
                  aria-label={label(locale, `预览 ${artifact.label}`, `Preview ${artifact.label}`)}
                  title={label(locale, '预览', 'Preview')}
                  disabled={pendingArtifactId !== undefined}
                  onClick={() => void preview(artifact.scratchArtifactId)}
                >
                  <EyeIcon size={14} />
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function label(locale: SupportedLocale, zh: string, en: string): string {
  return locale === 'zh-cn' ? zh : en;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
