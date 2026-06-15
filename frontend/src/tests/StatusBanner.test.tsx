import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBanner from '../components/StatusBanner';

describe('StatusBanner', () => {
  it('renders an error as an assertive alert', () => {
    render(<StatusBanner kind="error" message="Something broke" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
  });

  it('renders a success as a polite status', () => {
    render(<StatusBanner kind="success" message="All good" />);
    expect(screen.getByRole('status')).toHaveTextContent('All good');
  });

  it('shows an optional title above the message', () => {
    render(<StatusBanner kind="info" title="Heads up" message="Details here" />);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
  });

  it('renders a retry action when onRetry is provided', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<StatusBanner kind="error" message="Failed" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry action when onRetry is absent', () => {
    render(<StatusBanner kind="error" message="Failed" />);
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
  });
});
