import { useEffect, useState } from 'react';
import { ApiError, getWeather } from '../api/client';
import { useAuth } from '../auth/useAuth';
import CitySearch from '../components/CitySearch';
import {
  WeatherCard,
  WeatherEmpty,
  WeatherErrorCard,
  WeatherLoading,
} from '../components/WeatherCard';
import { loadRecent, saveRecent } from '../lib/recentCities';
import type { City, Weather } from '../types';

export default function HomePage() {
  const { token } = useAuth();
  const [recent, setRecent] = useState<City[]>(() => loadRecent());
  const [selectedCity, setSelectedCity] = useState<City | null>(
    () => loadRecent()[0] ?? null,
  );
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    if (!selectedCity || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWeather(null);
    getWeather(selectedCity, token)
      .then(({ weather }) => {
        if (cancelled) return;
        setWeather(weather);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? 'Could not load the weather for that city.'
            : 'Could not reach the server.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCity, token, refetchKey]);

  function handleSelectCity(city: City) {
    setSelectedCity(city);
    setRecent((prev) => saveRecent(city, prev));
  }

  return (
    <section className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-12 w-full">
        <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
          Home
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-ink leading-[1.1]">
          Pick a city to watch.
        </h1>
        <p className="mt-3 text-body max-w-prose">
          Current weather conditions for any place you choose, plus live alert
          popups the moment they're broadcast.
        </p>

        <div className="mt-10 max-w-xl">
          <CitySearch recentCities={recent} onSelect={handleSelectCity} />
        </div>

        <div className="mt-10">
          {!selectedCity && <WeatherEmpty />}
          {selectedCity && loading && <WeatherLoading />}
          {selectedCity && error && !loading && (
            <WeatherErrorCard
              message={error}
              onRetry={() => setRefetchKey((k) => k + 1)}
            />
          )}
          {selectedCity && weather && !loading && !error && (
            <WeatherCard weather={weather} />
          )}
        </div>
      </div>
    </section>
  );
}
