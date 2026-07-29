/**
 * OnboardingFlow — full-screen overlay for first-time AI service setup.
 *
 * Opens the local user config file where providers and API keys are configured.
 *
 * Closes when onComplete() is called or when isAiConfigured becomes true (auto-dismiss
 * handled by the parent via onComplete).
 */
import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { AgentHostMessages } from '@/messages';

type Step = 'choose' | 'fileOpened';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('choose');

  const handleOpenConfigFile = () => {
    AgentHostMessages.openUserConfigFile();
    setStep('fileOpened');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'color-mix(in srgb, var(--agent-bg) 90%, transparent)' }}
    >
      <div className="agent-card w-80 overflow-hidden">
        {/* Animated gradient accent bar */}
        <div className="neko-gradient-bar" />

        <div className="p-6">
          {/* Step: choose */}
          {step === 'choose' && (
            <>
              <h2 className="text-[13px] font-semibold mb-1">{t('onboarding.title')}</h2>
              <p className="mb-5 text-[11px] text-[var(--agent-fg-secondary)]">
                {t('onboarding.subtitle')}
              </p>
              <button
                onClick={handleOpenConfigFile}
                className="vscode-button flex w-full justify-center py-2 text-[12px] font-medium"
              >
                {t('onboarding.openConfigButton')}
              </button>
            </>
          )}

          {/* Step: fileOpened */}
          {step === 'fileOpened' && (
            <>
              <h2 className="text-[13px] font-semibold mb-3">{t('onboarding.fileOpenedTitle')}</h2>
              <p className="mb-5 text-[11px] text-[var(--agent-fg-secondary)]">
                {t('onboarding.fileOpenedHint')}
              </p>
              <button
                onClick={onComplete}
                className="vscode-button flex w-full justify-center py-2 text-[12px] font-medium"
              >
                {t('onboarding.gotIt')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
