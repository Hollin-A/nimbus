import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import OfflineNotice from '../components/OfflineNotice';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    configurable: true,
  });
}

describe('OfflineNotice', () => {
  beforeEach(() => {
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('renders nothing when navigator.onLine is true', () => {
    setOnline(true);
    const { container } = render(<OfflineNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the offline banner when navigator.onLine starts false', () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it('shows the banner when an offline event fires', () => {
    setOnline(true);
    render(<OfflineNotice />);
    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it('hides the banner when an online event fires', () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
  });
});
