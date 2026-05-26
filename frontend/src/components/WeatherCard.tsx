import { AlertCircle, Cloud } from 'lucide-react';
import type { Weather } from '../types';
import MetricTile from './MetricTile';
import WeatherGlyph from './WeatherGlyph';

function formatLocalTime(iso: string): string {
  // Open-Meteo returns local-time strings without a Z suffix
  // (e.g. "2026-05-26T14:00"). Render as a friendly HH:MM.
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[1]}:${match[2]}`;
}

export function WeatherCard({ weather }: { weather: Weather }) {
  return (
    <div className="rounded-card border border-border bg-white p-6 md:p-8 shadow-card">
      <div className="flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft">
          <WeatherGlyph
            icon={weather.icon}
            className="h-8 w-8 text-brand"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-5xl font-extrabold text-ink leading-none">
              {weather.temperature}°
            </span>
            <span className="text-lg text-body">{weather.condition}</span>
          </div>
          <p className="mt-2 text-sm text-body">
            Feels like {weather.apparentTemperature}° ·{' '}
            <span className="text-ink font-semibold">{weather.high}°</span>{' '}
            <span className="text-muted">/</span>{' '}
            <span className="text-ink font-semibold">{weather.low}°</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {weather.city}
            {weather.country ? `, ${weather.country}` : ''} ·{' '}
            {formatLocalTime(weather.localTime)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Humidity" value={weather.humidity} unit="%" />
        <MetricTile label="Wind" value={weather.windSpeed} unit="km/h" />
        <MetricTile label="UV index" value={weather.uvIndex} />
        <MetricTile label="Pressure" value={weather.pressure} unit="hPa" />
      </div>
    </div>
  );
}

export function WeatherEmpty() {
  return (
    <div className="rounded-card border border-dashed border-border p-10 text-center">
      <Cloud className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
      <p className="mt-4 text-body">Pick a city to see the weather.</p>
    </div>
  );
}

export function WeatherLoading() {
  return (
    <div className="rounded-card border border-border bg-white p-6 md:p-8 shadow-card">
      <div className="flex items-start gap-5 animate-pulse">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-lavender" />
        <div className="flex-1 space-y-3">
          <div className="h-10 w-32 rounded bg-lavender" />
          <div className="h-3 w-48 rounded bg-lavender" />
          <div className="h-3 w-40 rounded bg-lavender" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-card border border-border p-4 animate-pulse"
          >
            <div className="h-3 w-12 rounded bg-lavender" />
            <div className="mt-2 h-6 w-16 rounded bg-lavender" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface WeatherErrorProps {
  message: string;
  onRetry: () => void;
}

export function WeatherErrorCard({ message, onRetry }: WeatherErrorProps) {
  return (
    <div className="rounded-card border border-border bg-white p-6 text-center">
      <AlertCircle
        className="mx-auto h-8 w-8 text-severity-alert-text"
        aria-hidden="true"
      />
      <p className="mt-3 text-body">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
