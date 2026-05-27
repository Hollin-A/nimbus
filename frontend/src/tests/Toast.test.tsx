import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from '../components/Toast';
import type { LiveMessage } from '../types';

function makeMessage(overrides: Partial<LiveMessage> = {}): LiveMessage {
  return {
    id: 'msg-1',
    city: 'Melbourne',
    latitude: -37.81,
    longitude: 144.96,
    message: 'Storm warning',
    severity: 'alert',
    createdAt: '2026-05-27T04:30:00.000Z',
    ...overrides,
  };
}

describe('Toast', () => {
  it('renders the message text and the city', () => {
    render(<Toast message={makeMessage()} onClose={() => {}} />);
    expect(screen.getByText('Storm warning')).toBeInTheDocument();
    expect(screen.getByText('Melbourne')).toBeInTheDocument();
  });

  it('renders the severity badge label', () => {
    render(<Toast message={makeMessage({ severity: 'warning' })} onClose={() => {}} />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('applies alert-tinted styling for severity=alert', () => {
    const { container } = render(
      <Toast message={makeMessage({ severity: 'alert' })} onClose={() => {}} />,
    );
    expect(container.querySelector('.bg-severity-alert-bg')).toBeInTheDocument();
    expect(
      container.querySelector('.text-severity-alert-text'),
    ).toBeInTheDocument();
  });

  it('applies info-tinted styling for severity=info', () => {
    const { container } = render(
      <Toast message={makeMessage({ severity: 'info' })} onClose={() => {}} />,
    );
    expect(container.querySelector('.bg-severity-info-bg')).toBeInTheDocument();
    expect(
      container.querySelector('.text-severity-info-text'),
    ).toBeInTheDocument();
  });

  it('applies warning-tinted styling for severity=warning', () => {
    const { container } = render(
      <Toast message={makeMessage({ severity: 'warning' })} onClose={() => {}} />,
    );
    expect(
      container.querySelector('.bg-severity-warning-bg'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.text-severity-warning-text'),
    ).toBeInTheDocument();
  });

  it('fires onClose when the dismiss button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Toast message={makeMessage()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('exposes role="status" so screen readers announce it', () => {
    render(<Toast message={makeMessage()} onClose={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
