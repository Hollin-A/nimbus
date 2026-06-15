import { useEffect, useState } from 'react';
import { ApiError, getWeather } from '../api/client';
import { useAuth } from '../auth/useAuth';
import CitySearch from '../components/CitySearch';
import MessageHistory from '../components/MessageHistory';
import ToastHost from '../components/ToastHost';
import StatusBanner from '../components/StatusBanner';
import {
  WeatherCard,
  WeatherEmpty,
  WeatherLoading,
  WeatherOffline,
} from '../components/WeatherCard';
import { loadRecent, saveRecent } from '../lib/recentCities';
import { useOnline } from '../lib/useOnline';
import { useCityMessages } from '../socket/useLiveMessages';
import type { City, Weather } from '../types';

export default function HomePage() {
  const { token } = useAuth();
  const online = useOnline();
  const [recent, setRecent] = useState<City[]>(() => loadRecent());
  const [selectedCity, setSelectedCity] = useState<City | null>(
    () => loadRecent()[0] ?? null,
  );
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const {
    history: messages,
    historyError,
    subscribe,
  } = useCityMessages(selectedCity);

  useEffect(() => {
    // Don't fire a request that's doomed to fail while offline — the offline
    // state below explains the gap. Re-runs when connectivity returns.
    if (!selectedCity || !token || !online) return;
    // Abort the previous city's fetch when this effect re-runs (city change)
    // or unmounts, so rapid switching doesn't pile up concurrent requests.
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setWeather(null);
    getWeather(selectedCity, token, { signal: controller.signal })
      .then(({ weather }) => {
        if (controller.signal.aborted) return;
        setWeather(weather);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError
            ? 'Could not load the weather for that city.'
            : 'Could not reach the server.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedCity, token, refetchKey, online]);

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

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            {!selectedCity && <WeatherEmpty />}
            {selectedCity && !online && <WeatherOffline />}
            {selectedCity && online && loading && <WeatherLoading />}
            {selectedCity && online && error && !loading && (
              <StatusBanner
                kind="error"
                message={error}
                onRetry={() => setRefetchKey((k) => k + 1)}
              />
            )}
            {selectedCity && online && weather && !loading && !error && (
              <WeatherCard weather={weather} />
            )}
          </div>
          <aside className="md:col-span-1">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted font-semibold mb-3">
              Live alerts
            </h2>
            <MessageHistory
              city={selectedCity?.name ?? null}
              messages={messages}
              error={historyError}
            />
          </aside>
        </div>
      </div>

      <ToastHost subscribe={subscribe} />
    </section>
  );
}
