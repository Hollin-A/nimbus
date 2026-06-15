import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CitySearch from '../components/CitySearch';
import type { City } from '../types';

const { mockSearchCities } = vi.hoisted(() => ({ mockSearchCities: vi.fn() }));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    token: 't',
    status: 'authed' as const,
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, searchCities: mockSearchCities };
});

const LISBON: City = { name: 'Lisbon', country: 'PT', latitude: 38.72, longitude: -9.13 };

describe('CitySearch', () => {
  beforeEach(() => {
    mockSearchCities.mockReset();
    mockSearchCities.mockResolvedValue({ cities: [LISBON] });
  });

  it('searches as you type and selecting a result fires onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CitySearch value={null} onChange={onChange} recentCities={[]} />);

    await user.type(
      screen.getByRole('combobox', { name: /search for a city/i }),
      'Lis',
    );
    const option = await screen.findByRole('option', { name: /lisbon/i });
    await user.click(option);

    expect(mockSearchCities).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(LISBON);
  });

  it('shows the selected city label inside the input', () => {
    render(<CitySearch value={LISBON} onChange={() => {}} recentCities={[]} />);
    expect(
      screen.getByRole('combobox', { name: /search for a city/i }),
    ).toHaveValue('Lisbon');
  });

  it('clears the selection when the clear button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CitySearch value={LISBON} onChange={onChange} recentCities={[]} />);

    await user.click(screen.getByRole('button', { name: /clear selected city/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers recent cities as quick chips', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CitySearch value={null} onChange={onChange} recentCities={[LISBON]} />);

    await user.click(screen.getByRole('button', { name: 'Lisbon' }));

    expect(onChange).toHaveBeenCalledWith(LISBON);
  });
});
