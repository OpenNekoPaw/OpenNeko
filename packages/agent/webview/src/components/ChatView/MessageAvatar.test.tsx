import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageAvatar } from './MessageAvatar';

describe('MessageAvatar', () => {
  it('renders an image avatar when an image URI is provided', () => {
    render(
      <MessageAvatar
        role="assistant"
        label="小橘"
        imageUri="http://127.0.0.1:43125/resources/avatars/xiaoju.png"
        title="小橘"
      />,
    );

    const avatar = screen.getByLabelText('小橘');
    const image = avatar.querySelector('img');
    expect(image?.getAttribute('src')).toBe('http://127.0.0.1:43125/resources/avatars/xiaoju.png');
  });

  it('falls back to the text label when the image fails to load', () => {
    render(
      <MessageAvatar
        role="assistant"
        label="Character feedback"
        imageUri="http://127.0.0.1:43125/resources/avatars/missing.png"
        title="Character feedback"
      />,
    );

    const avatar = screen.getByLabelText('Character feedback');
    const image = avatar.querySelector('img');
    expect(image).toBeTruthy();

    fireEvent.error(image!);

    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent).toBe('CF');
  });
});
