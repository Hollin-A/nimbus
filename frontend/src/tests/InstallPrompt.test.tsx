import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import InstallPrompt from '../components/InstallPrompt';

describe('InstallPrompt', () => {
  it('gives the install button a descriptive accessible name', () => {
    render(<InstallPrompt />);
    // The chip only appears once the browser offers the install prompt.
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    expect(
      screen.getByRole('button', { name: /install nimbus as an app/i }),
    ).toBeInTheDocument();
  });
});
