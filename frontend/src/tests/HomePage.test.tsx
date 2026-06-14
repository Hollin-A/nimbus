import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../pages/HomePage';

const { mockGetWeather, mockOnline } = vi.hoisted(() => ({
  mockGetWeather: vi.fn(),
  mockOnline: { value: true },
}));

vi.mock('../lib/useOnline', () => ({ useOnline: () => mockOnline.value }));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', username: 'u', displayName: 'U', role: 'user' },
    token: 't',
    status: 'authed' as const,
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// The live-message machinery (socket + REST history) is out of scope here.
vi.mock('../socket/useLiveMessages', () => ({
  useCityMessages: () => ({ history: [], latest: null, historyError: null }),
}));

vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, getWeather: mockGetWeather };
});

// Stub CitySearch to two one-click pickers so the fetch tests don't depend
// on its debounced-search machinery (covered by its own tests).
const CITY_A = { name: 'Oslo', latitude: 59.91, longitude: 10.75 };
const CITY_B = { name: 'Bergen', latitude: 60.39, longitude: 5.32 };
vi.mock('../components/CitySearch', () => ({
  default: ({ onSelect }: { onSelect: (c: typeof CITY_A) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect(CITY_A)}>
        select A
      </button>
      <button type="button" onClick={() => onSelect(CITY_B)}>
        select B
      </button>
    </div>
  ),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage weather fetch', () => {
  beforeEach(() => {
    mockGetWeather.mockReset();
    // Default to an in-flight fetch so a stray call doesn't reject; tests that
    // care override this.
    mockGetWeather.mockReturnValue(new Promise<never>(() => {}));
    mockOnline.value = true;
    localStorage.clear();
  });

  it('skips the weather fetch and shows an offline state when offline', async () => {
    mockOnline.value = false;
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'select A' }));

    expect(mockGetWeather).not.toHaveBeenCalled();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('aborts the previous weather fetch when the city changes', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    mockGetWeather.mockImplementation(
      (_city: unknown, _token: string, options?: { signal?: AbortSignal }) => {
        signals.push(options?.signal);
        return new Promise(() => {}); // never resolves — stays in flight
      },
    );
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'select A' }));
    await user.click(screen.getByRole('button', { name: 'select B' }));

    // Two fetches fired, but only the latest should still be live.
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});
