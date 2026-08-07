import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotIcon, MessageIcon, UserIcon, UsersIcon } from './identity';

describe('identity icons', () => {
  it('exports distinct assistant, person, group and message silhouettes', () => {
    const bot = renderToStaticMarkup(<BotIcon />);
    const user = renderToStaticMarkup(<UserIcon />);
    const users = renderToStaticMarkup(<UsersIcon />);
    const message = renderToStaticMarkup(<MessageIcon />);

    expect(bot).toContain('<rect x="4" y="8" width="16" height="12" rx="2"></rect>');
    expect(user).toContain('<circle cx="12" cy="8" r="4"></circle>');
    expect(users).toContain('<circle cx="9" cy="8" r="4"></circle>');
    expect(message).toContain('M21 15a4 4 0 0 1-4 4H8l-5 3V7');
    expect(new Set([bot, user, users, message])).toHaveLength(4);
  });

  it('uses the shared size, class and current-color stroke contract', () => {
    const markup = renderToStaticMarkup(
      <MessageIcon size={14} className="identity-icon" strokeWidth={1.5} />,
    );

    expect(markup).toContain('width="14"');
    expect(markup).toContain('height="14"');
    expect(markup).toContain('class="identity-icon"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="1.5"');
  });
});
