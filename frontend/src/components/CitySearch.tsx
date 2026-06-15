import { useEffect, useState } from 'react';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { City } from '../types';
import { searchCities, ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

interface CitySearchProps {
  value: City | null;
  onChange: (city: City | null) => void;
  recentCities: City[];
}

// Cities are identified by coordinates; match on those so the selected option
// is recognised regardless of which object reference it came from.
function sameCity(a: City | null, b: City | null): boolean {
  return a?.latitude === b?.latitude && a?.longitude === b?.longitude;
}

export default function CitySearch({
  value,
  onChange,
  recentCities,
}: CitySearchProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search. Each keystroke aborts the previous in-flight fetch —
  // otherwise rapid typing piles up concurrent requests against the shared
  // Render outbound IP, which Open-Meteo's CDN blocks.
  useEffect(() => {
    const q = query.trim();
    if (!token || q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const { cities } = await searchCities(q, token, {
          signal: controller.signal,
        });
        if (cancelled) return;
        setResults(cities);
      } catch (err) {
        // Caller-cancellation: our cleanup fired before this resolved. Bail
        // silently — no error flash for a request we intentionally cancelled.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? 'Could not search cities.'
            : 'Could not reach the server.',
        );
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, token]);

  function handleSelect(city: City | null) {
    onChange(city);
    setQuery('');
  }

  const q = query.trim();
  const showNoMatches =
    !loading && !error && q.length >= 2 && results.length === 0;

  return (
    <div className="space-y-4">
      <Combobox value={value} onChange={handleSelect} by={sameCity}>
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"
            aria-hidden="true"
          />
          <ComboboxInput
            aria-label="Search for a city"
            displayValue={(city: City | null) => city?.name ?? ''}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a city…"
            className="w-full rounded-full border border-border bg-white pl-11 pr-10 py-3 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {value ? (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              aria-label="Clear selected city"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <ComboboxButton
              aria-label="Show city suggestions"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </ComboboxButton>
          )}

          <ComboboxOptions className="absolute z-10 mt-2 w-full rounded-card border border-border bg-white shadow-elevated overflow-hidden empty:invisible">
            {loading && (
              <div className="px-4 py-3 text-sm text-muted">Searching…</div>
            )}
            {!loading && error && (
              <div className="px-4 py-3 text-sm text-severity-alert-text">
                {error}
              </div>
            )}
            {showNoMatches && (
              <div className="px-4 py-3 text-sm text-muted">
                No matches for "{q}".
              </div>
            )}
            {!loading &&
              !error &&
              results.map((city, index) => (
                <ComboboxOption
                  key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}
                  value={city}
                  className="block w-full text-left px-4 py-3 text-sm cursor-pointer data-[focus]:bg-lavender"
                >
                  <span className="font-semibold text-ink">{city.name}</span>
                  {city.country && (
                    <span className="ml-2 text-muted">{city.country}</span>
                  )}
                </ComboboxOption>
              ))}
          </ComboboxOptions>
        </div>
      </Combobox>

      {recentCities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted font-semibold mr-1">
            Recent
          </span>
          {recentCities.map((city, index) => (
            <button
              key={`recent-${city.latitude}-${city.longitude}-${index}`}
              type="button"
              onClick={() => onChange(city)}
              className="rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft/70 transition-colors"
            >
              {city.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
