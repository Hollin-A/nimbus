import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageHistory from '../components/MessageHistory';
import type { LiveMessage } from '../types';

function makeMessage(overrides: Partial<LiveMessage>): LiveMessage {
  return {
    id: 'm',
    city: 'Melbourne',
    latitude: -37.81,
    longitude: 144.96,
    message: 'Storm warning',
    severity: 'alert',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MessageHistory', () => {
  it('shows the "no city selected" prompt when city is null', () => {
    render(<MessageHistory city={null} messages={[]} />);
    expect(
      screen.getByText(/past alerts for the selected city show up here/i),
    ).toBeInTheDocument();
  });

  it('shows a "no alerts yet" prompt for a city with no history', () => {
    render(<MessageHistory city="Melbourne" messages={[]} />);
    expect(screen.getByText(/no alerts for Melbourne yet/i)).toBeInTheDocument();
  });

  it('shows the error message when given an error', () => {
    render(
      <MessageHistory
        city="Melbourne"
        messages={[]}
        error="Could not load past alerts."
      />,
    );
    expect(screen.getByText(/could not load past alerts/i)).toBeInTheDocument();
  });

  it('renders one list item per message', () => {
    const messages = [
      makeMessage({
        id: '1',
        message: 'Storm warning',
        severity: 'alert',
        createdAt: new Date(Date.now() - 30_000).toISOString(),
      }),
      makeMessage({
        id: '2',
        message: 'Wind gust advisory',
        severity: 'warning',
        createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      }),
      makeMessage({
        id: '3',
        message: 'Public transport delay',
        severity: 'info',
        createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      }),
    ];
    render(<MessageHistory city="Melbourne" messages={messages} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Storm warning')).toBeInTheDocument();
    expect(screen.getByText('Wind gust advisory')).toBeInTheDocument();
    expect(screen.getByText('Public transport delay')).toBeInTheDocument();
  });

  it('renders a relative time label per message', () => {
    const messages = [
      makeMessage({
        id: '1',
        createdAt: new Date(Date.now() - 30_000).toISOString(),
      }),
    ];
    render(<MessageHistory city="Melbourne" messages={messages} />);

    // 30 seconds ago should be "30s ago"
    expect(screen.getByText(/30s ago/)).toBeInTheDocument();
  });
});
