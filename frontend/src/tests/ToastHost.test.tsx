import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ToastHost from '../components/ToastHost';
import type { LiveMessage } from '../types';

function makeMsg(id: string, message: string): LiveMessage {
  return {
    id,
    city: 'Melbourne',
    latitude: -37.81,
    longitude: 144.96,
    message,
    severity: 'info',
    createdAt: new Date().toISOString(),
  };
}

describe('ToastHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when latest is null', () => {
    const { container } = render(<ToastHost latest={null} />);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it('renders the latest message as a toast', () => {
    render(<ToastHost latest={makeMsg('1', 'Hello')} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('keeps prior toasts visible when a new latest arrives within the dismiss window', () => {
    const { rerender } = render(<ToastHost latest={makeMsg('1', 'First')} />);
    expect(screen.getByText('First')).toBeInTheDocument();

    rerender(<ToastHost latest={makeMsg('2', 'Second')} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    rerender(<ToastHost latest={makeMsg('3', 'Third')} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('caps the visible queue at 3, evicting the oldest', () => {
    const { rerender } = render(<ToastHost latest={makeMsg('1', 'First')} />);
    rerender(<ToastHost latest={makeMsg('2', 'Second')} />);
    rerender(<ToastHost latest={makeMsg('3', 'Third')} />);
    rerender(<ToastHost latest={makeMsg('4', 'Fourth')} />);

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.getByText('Fourth')).toBeInTheDocument();
  });

  it('auto-dismisses each toast 7 seconds after IT was added (regression: cleanup used to clear earlier timers)', () => {
    const { rerender } = render(<ToastHost latest={makeMsg('1', 'First')} />);

    // 3 seconds later: queue the second toast.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    rerender(<ToastHost latest={makeMsg('2', 'Second')} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // 4 more seconds (7s total since First) — First should now auto-dismiss.
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // 3 more seconds (7s total since Second) — Second should now auto-dismiss.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('does not re-add a toast if the same message id arrives again', () => {
    const msg = makeMsg('1', 'Only Once');
    const { rerender } = render(<ToastHost latest={msg} />);
    // New object reference, same id — dedupe by seenIds.
    rerender(<ToastHost latest={makeMsg('1', 'Only Once')} />);

    expect(screen.getAllByText('Only Once')).toHaveLength(1);
  });

  it('dismisses a toast when the close button is clicked, and stops its auto-dismiss timer', () => {
    render(<ToastHost latest={makeMsg('1', 'Goodbye')} />);
    expect(screen.getByText('Goodbye')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Goodbye')).not.toBeInTheDocument();

    // Advance past 7s — nothing should error or re-render.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.queryByText('Goodbye')).not.toBeInTheDocument();
  });
});
