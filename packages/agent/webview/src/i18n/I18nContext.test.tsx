// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentPresentationI18nProvider, useTranslation } from './I18nContext';

afterEach(cleanup);

function TranslationProbe(): JSX.Element {
  const { locale, t } = useTranslation();
  const [count, setCount] = useState(0);
  return (
    <div data-testid="translation-probe" data-locale={locale}>
      <span>{t('chat.input.entryPlaceholder')}</span>
      <span>{t('chat.executionMode.title')}</span>
      <button type="button" onClick={() => setCount((current) => current + 1)}>
        {count}
      </button>
    </div>
  );
}

describe('Agent presentation i18n provider', () => {
  it('switches the locale and message service as one presentation state', () => {
    const view = render(
      <AgentPresentationI18nProvider locale="en">
        <TranslationProbe />
      </AgentPresentationI18nProvider>,
    );

    expect(screen.getByTestId('translation-probe').dataset.locale).toBe('en');
    expect(screen.getByText('Describe what you want to create...')).toBeTruthy();
    expect(screen.getByText('Execution mode')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '0' }));

    view.rerender(
      <AgentPresentationI18nProvider locale="zh-cn">
        <TranslationProbe />
      </AgentPresentationI18nProvider>,
    );

    expect(screen.getByTestId('translation-probe').dataset.locale).toBe('zh-cn');
    expect(screen.getByText('描述你想要完成的内容...')).toBeTruthy();
    expect(screen.getByText('执行模式')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
  });
});
