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

// A tiny controllable emitter matching the hook's subscribe contract: each
// emitted message is delivered to every listener (no shared "latest" slot).
function makeEmitter() {
  const listeners = new Set<(message: LiveMessage) => void>();
  const subscribe = (listener: (message: LiveMessage) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const emit = (message: LiveMessage) =>
    listeners.forEach((listener) => listener(message));
  return { subscribe, emit };
}

describe('ToastHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing before any message arrives', () => {
    const { subscribe } = makeEmitter();
    const { container } = render(<ToastHost subscribe={subscribe} />);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it('renders an emitted message as a toast', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    act(() => emit(makeMsg('1', 'Hello')));
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows every message in a same-tick burst (no drop)', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    // Two messages delivered within one React batch — the old single-`latest`
    // slot would have collapsed these to just the last one.
    act(() => {
      emit(makeMsg('1', 'First'));
      emit(makeMsg('2', 'Second'));
    });
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('caps the visible queue at 3, evicting the oldest', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    act(() => emit(makeMsg('1', 'First')));
    act(() => emit(makeMsg('2', 'Second')));
    act(() => emit(makeMsg('3', 'Third')));
    act(() => emit(makeMsg('4', 'Fourth')));

    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.getByText('Fourth')).toBeInTheDocument();
  });

  it('auto-dismisses each toast 7 seconds after IT arrived', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    act(() => emit(makeMsg('1', 'First')));

    // 3 seconds later: a second toast arrives.
    act(() => vi.advanceTimersByTime(3_000));
    act(() => emit(makeMsg('2', 'Second')));
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // 4 more seconds (7s total since First) — First auto-dismisses.
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();

    // 3 more seconds (7s total since Second) — Second auto-dismisses.
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('does not re-toast the same message id', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    act(() => emit(makeMsg('1', 'Only Once')));
    act(() => emit(makeMsg('1', 'Only Once')));

    expect(screen.getAllByText('Only Once')).toHaveLength(1);
  });

  it('dismisses a toast on close-button click and stops its auto-dismiss timer', () => {
    const { subscribe, emit } = makeEmitter();
    render(<ToastHost subscribe={subscribe} />);
    act(() => emit(makeMsg('1', 'Goodbye')));
    expect(screen.getByText('Goodbye')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Goodbye')).not.toBeInTheDocument();

    // Advance past 7s — nothing should error or re-render.
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText('Goodbye')).not.toBeInTheDocument();
  });
});
