import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  WeatherCard,
  WeatherEmpty,
  WeatherErrorCard,
  WeatherLoading,
} from '../components/WeatherCard';
import type { Weather } from '../types';

const sampleWeather: Weather = {
  city: 'Melbourne',
  country: 'Australia',
  temperature: 22,
  apparentTemperature: 21,
  humidity: 55,
  windSpeed: 12,
  pressure: 1013,
  uvIndex: 4,
  high: 24,
  low: 16,
  isDay: true,
  weatherCode: 2,
  condition: 'Partly cloudy',
  icon: 'partly-cloudy',
  localTime: '2026-05-27T14:30',
  observedAt: '2026-05-27T04:30:00.000Z',
};

describe('WeatherCard', () => {
  it('renders temperature, condition, and city + country', () => {
    render(<WeatherCard weather={sampleWeather} />);
    expect(screen.getByText('22°')).toBeInTheDocument();
    expect(screen.getByText('Partly cloudy')).toBeInTheDocument();
    expect(screen.getByText(/Melbourne, Australia/)).toBeInTheDocument();
  });

  it('renders feels-like, high, and low temperatures', () => {
    render(<WeatherCard weather={sampleWeather} />);
    const subtitle = screen.getByText(/Feels like 21°/);
    expect(subtitle).toBeInTheDocument();
    expect(subtitle).toHaveTextContent(/24°/);
    expect(subtitle).toHaveTextContent(/16°/);
  });

  it('renders the local time as HH:MM', () => {
    render(<WeatherCard weather={sampleWeather} />);
    // localTime is "2026-05-27T14:30" — should show 14:30 in the city line
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it('renders all four metric tiles with values and units', () => {
    render(<WeatherCard weather={sampleWeather} />);
    expect(screen.getByText(/humidity/i)).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText(/wind/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/km\/h/i)).toBeInTheDocument();
    expect(screen.getByText(/uv index/i)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/pressure/i)).toBeInTheDocument();
    expect(screen.getByText('1013')).toBeInTheDocument();
    expect(screen.getByText(/hPa/)).toBeInTheDocument();
  });

  it('omits the country comma when country is not provided', () => {
    render(
      <WeatherCard weather={{ ...sampleWeather, country: undefined }} />,
    );
    expect(screen.getByText(/Melbourne/)).toBeInTheDocument();
    expect(screen.queryByText(/Australia/)).not.toBeInTheDocument();
  });
});

describe('WeatherEmpty', () => {
  it('shows the pick-a-city prompt', () => {
    render(<WeatherEmpty />);
    expect(screen.getByText(/pick a city to see the weather/i)).toBeInTheDocument();
  });
});

describe('WeatherLoading', () => {
  it('renders animated skeleton placeholders', () => {
    const { container } = render(<WeatherLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0,
    );
  });
});

describe('WeatherErrorCard', () => {
  it('renders the supplied error message', () => {
    render(
      <WeatherErrorCard
        message="Could not load the weather for that city."
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByText(/could not load the weather for that city/i),
    ).toBeInTheDocument();
  });

  it('fires onRetry when the Try-again button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<WeatherErrorCard message="oops" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
