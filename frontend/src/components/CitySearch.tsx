import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { City } from '../types';
import { searchCities, ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

interface CitySearchProps {
  recentCities: City[];
  onSelect: (city: City) => void;
}

export default function CitySearch({
  recentCities,
  onSelect,
}: CitySearchProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!token || q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const { cities } = await searchCities(q, token);
        if (cancelled) return;
        setResults(cities);
      } catch (err) {
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
    };
  }, [query, token]);

  function pickCity(city: City) {
    onSelect(city);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for a city…"
          aria-label="Search for a city"
          className="w-full rounded-full border border-border bg-white pl-11 pr-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {showDropdown && (
          <div className="absolute z-10 mt-2 w-full rounded-card border border-border bg-white shadow-elevated overflow-hidden">
            {loading && (
              <div className="px-4 py-3 text-sm text-muted">Searching…</div>
            )}
            {!loading && error && (
              <div className="px-4 py-3 text-sm text-severity-alert-text">
                {error}
              </div>
            )}
            {!loading && !error && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted">
                No matches for "{query.trim()}".
              </div>
            )}
            {!loading &&
              !error &&
              results.map((city, index) => (
                <button
                  key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}
                  type="button"
                  onClick={() => pickCity(city)}
                  className="block w-full text-left px-4 py-3 text-sm hover:bg-lavender transition-colors"
                >
                  <span className="font-semibold text-ink">{city.name}</span>
                  {city.country && (
                    <span className="ml-2 text-muted">{city.country}</span>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>

      {recentCities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted font-semibold mr-1">
            Recent
          </span>
          {recentCities.map((city, index) => (
            <button
              key={`recent-${city.latitude}-${city.longitude}-${index}`}
              type="button"
              onClick={() => onSelect(city)}
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
