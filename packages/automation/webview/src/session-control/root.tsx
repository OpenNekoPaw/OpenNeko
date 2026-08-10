import { Button } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AutomationSessionControlAction,
  AutomationSessionControlProjection,
  AutomationSessionControlRuntime,
} from '@neko/automation-contracts/session-control';

interface AutomationSessionControlContextValue {
  readonly conversationId?: string;
  readonly controls: readonly AutomationSessionControlProjection[];
  readonly busyCommand?: string;
  readonly error?: string;
  readonly control: (
    projection: AutomationSessionControlProjection,
    action: AutomationSessionControlAction,
  ) => Promise<void>;
}

const AutomationSessionControlContext = createContext<
  AutomationSessionControlContextValue | undefined
>(undefined);

export function AutomationSessionControlProvider({
  children,
  runtime,
}: {
  readonly children: ReactNode;
  readonly runtime?: AutomationSessionControlRuntime;
}): JSX.Element {
  const [controls, setControls] = useState<readonly AutomationSessionControlProjection[]>([]);
  const [busyCommand, setBusyCommand] = useState<string>();
  const [error, setError] = useState<string>();
  const active = useRef(false);
  const busy = useRef(false);
  const refreshSequence = useRef(0);

  const refresh = useCallback((): void => {
    if (!runtime) return;
    refreshSequence.current += 1;
    const sequence = refreshSequence.current;
    void runtime.list().then(
      (next) => {
        if (!active.current || sequence !== refreshSequence.current) return;
        setControls(next);
        setError(undefined);
      },
      (reason: unknown) => {
        if (!active.current || sequence !== refreshSequence.current) return;
        setError(describeError(reason));
      },
    );
  }, [runtime]);

  useEffect(() => {
    if (!runtime) {
      active.current = false;
      setControls([]);
      setBusyCommand(undefined);
      setError(undefined);
      return;
    }
    active.current = true;
    const unsubscribe = runtime.subscribe(refresh);
    refresh();
    return () => {
      active.current = false;
      refreshSequence.current += 1;
      unsubscribe();
    };
  }, [refresh, runtime]);

  const control = useCallback(
    async (
      projection: AutomationSessionControlProjection,
      action: AutomationSessionControlAction,
    ): Promise<void> => {
      if (!runtime) {
        throw new Error('Automation session control runtime is unavailable.');
      }
      if (busy.current) return;
      busy.current = true;
      const commandKey = `${projection.sessionId}:${action}`;
      setBusyCommand(commandKey);
      setError(undefined);
      try {
        await runtime.control({
          sessionId: projection.sessionId,
          owner: projection.owner,
          action,
        });
        refreshSequence.current += 1;
        const sequence = refreshSequence.current;
        const next = await runtime.list();
        if (active.current && sequence === refreshSequence.current) {
          setControls(next);
        }
      } catch (reason: unknown) {
        if (active.current) setError(describeError(reason));
      } finally {
        busy.current = false;
        if (active.current) setBusyCommand(undefined);
      }
    },
    [runtime],
  );

  return (
    <AutomationSessionControlContext.Provider
      value={{
        conversationId: runtime?.identity.conversationId,
        controls,
        busyCommand,
        error,
        control,
      }}
    >
      {children}
    </AutomationSessionControlContext.Provider>
  );
}

export function AutomationSessionControlTimelineItem({
  conversationId,
  isRunning,
  toolCallId,
  toolName,
}: {
  readonly conversationId: string | null;
  readonly isRunning: boolean;
  readonly toolCallId: string;
  readonly toolName: string;
}): JSX.Element | null {
  const { t } = useTranslation();
  const context = useAutomationSessionControlContext();
  const scopeMatches = conversationId !== null && context.conversationId === conversationId;
  const projection = scopeMatches
    ? context.controls.find(
        (item) =>
          item.owner.conversationId === conversationId && item.owner.toolCallId === toolCallId,
      )
    : undefined;

  if (!projection) {
    return scopeMatches && context.error && isRunning && isAutomationToolName(toolName) ? (
      <div
        className="automation-session-control__diagnostic"
        data-automation-session-control-diagnostic="true"
        role="alert"
      >
        {context.error}
      </div>
    ) : null;
  }

  return (
    <section
      aria-label={t('automation.sessionControl.title')}
      className="automation-session-control__session"
      data-automation-session-control="true"
      data-session-id={projection.sessionId}
      data-tool-call-id={projection.owner.toolCallId}
    >
      {context.error ? (
        <div className="automation-session-control__diagnostic" role="alert">
          {context.error}
        </div>
      ) : null}
      <header className="automation-session-control__header">
        <div>
          <p>{t('automation.sessionControl.eyebrow')}</p>
          <h3>{projection.target.label}</h3>
        </div>
        <span>{projection.provider.providerId}</span>
      </header>
      <dl className="automation-session-control__facts">
        <div>
          <dt>{t('automation.sessionControl.mode')}</dt>
          <dd>{t(`automation.targetSelection.mode.${projection.mode}`)}</dd>
        </div>
        <div>
          <dt>{t('automation.sessionControl.budget')}</dt>
          <dd>{projection.remainingSteps}</dd>
        </div>
        <div>
          <dt>{t('automation.sessionControl.phase')}</dt>
          <dd>{t(`automation.sessionControl.phase.${projection.phase}`)}</dd>
        </div>
        <div>
          <dt>{t('automation.sessionControl.evidence')}</dt>
          <dd>{t(`automation.sessionControl.evidence.${projection.evidenceStatus}`)}</dd>
        </div>
      </dl>
      <div className="automation-session-control__actions">
        {projection.availableActions.map((action) => (
          <Button
            data-automation-control-action={action}
            disabled={context.busyCommand !== undefined}
            key={action}
            onClick={() => void context.control(projection, action)}
            size="xs"
            variant={action === 'take-over' ? 'danger' : action === 'stop' ? 'secondary' : 'ghost'}
          >
            {context.busyCommand === `${projection.sessionId}:${action}`
              ? t('automation.sessionControl.working')
              : t(`automation.sessionControl.action.${action}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function useAutomationSessionControlContext(): AutomationSessionControlContextValue {
  const context = useContext(AutomationSessionControlContext);
  if (!context) {
    throw new Error('Automation session Timeline item requires its package-owned provider.');
  }
  return context;
}

function isAutomationToolName(toolName: string): boolean {
  return toolName.startsWith('automation_');
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
