import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstallPrompt from '../components/InstallPrompt';

// The browser fires `beforeinstallprompt` with a prompt() + userChoice; build
// one with those mocked so the click flow can be exercised.
function makeInstallEvent() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

const installButton = { name: /install nimbus as an app/i };

describe('InstallPrompt', () => {
  it('renders nothing until the browser offers the prompt', () => {
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the chip with a descriptive accessible name once offered', () => {
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(screen.getByRole('button', installButton)).toBeInTheDocument();
  });

  it('prompts the browser and clears the chip on click', async () => {
    const event = makeInstallEvent();
    const user = userEvent.setup();
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(event);
    });

    await user.click(screen.getByRole('button', installButton));

    expect(event.prompt).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('button', installButton)).not.toBeInTheDocument(),
    );
  });

  it('clears the chip when the app is installed elsewhere', () => {
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(makeInstallEvent());
    });
    expect(screen.getByRole('button', installButton)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(screen.queryByRole('button', installButton)).not.toBeInTheDocument();
  });
});
