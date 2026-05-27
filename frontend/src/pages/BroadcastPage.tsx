import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { ApiError, pushMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';
import CitySearch from '../components/CitySearch';
import SeveritySelect from '../components/SeveritySelect';
import { useOnline } from '../lib/useOnline';
import type { City, Severity } from '../types';

const MAX_MESSAGE_LENGTH = 280;
const CONFIRMATION_TIMEOUT_MS = 4_000;

export default function BroadcastPage() {
  const { token } = useAuth();
  const online = useOnline();
  const [targetCity, setTargetCity] = useState<City | null>(null);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Auto-dismiss the success confirmation.
  useEffect(() => {
    if (!confirmation) return;
    const handle = setTimeout(
      () => setConfirmation(null),
      CONFIRMATION_TIMEOUT_MS,
    );
    return () => clearTimeout(handle);
  }, [confirmation]);

  const remaining = MAX_MESSAGE_LENGTH - message.length;
  const canSubmit =
    !submitting &&
    online &&
    !!token &&
    targetCity !== null &&
    message.trim().length > 0 &&
    remaining >= 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !token || !targetCity) return;

    setSubmitting(true);
    setError(null);
    setConfirmation(null);

    try {
      await pushMessage(
        {
          city: targetCity.name,
          latitude: targetCity.latitude,
          longitude: targetCity.longitude,
          message: message.trim(),
          severity,
        },
        token,
      );
      const where = targetCity.country
        ? `${targetCity.name}, ${targetCity.country}`
        : targetCity.name;
      setConfirmation(`Broadcast sent to ${where}.`);
      // Clear the message but keep city + severity so the operator can
      // fire follow-ups to the same place quickly.
      setMessage('');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setError('That broadcast is invalid. Check the city and message.');
        } else if (err.status === 401) {
          setError('Your session has expired. Sign in again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Could not reach the server.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex-1">
      <div className="mx-auto max-w-6xl px-6 py-12 w-full">
        <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
          Broadcast
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-ink leading-[1.1]">
          Send an alert to a city.
        </h1>
        <p className="mt-3 text-body max-w-prose">
          Anyone watching that city will see your message as a popup and in
          their alert history. Cities are identified by coordinates, so
          Melbourne (AU) and Melbourne (FL) are different targets.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 max-w-xl space-y-5">
          <div>
            <span className="block text-sm font-semibold text-ink mb-1">
              Target city
            </span>
            {targetCity ? (
              <div className="flex items-center justify-between rounded-input border border-border bg-white px-3 py-2.5">
                <div className="text-sm">
                  <span className="font-semibold text-ink">
                    {targetCity.name}
                  </span>
                  {targetCity.country && (
                    <span className="ml-2 text-muted">
                      {targetCity.country}
                    </span>
                  )}
                  <span className="ml-3 text-xs text-muted">
                    {targetCity.latitude.toFixed(2)},{' '}
                    {targetCity.longitude.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetCity(null)}
                  aria-label="Clear selected city"
                  className="text-muted hover:text-ink transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <CitySearch
                recentCities={[]}
                onSelect={(city) => setTargetCity(city)}
              />
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="message"
                className="block text-sm font-semibold text-ink"
              >
                Message
              </label>
              <span
                className={`text-xs ${remaining < 0 ? 'text-severity-alert-text' : 'text-muted'}`}
                aria-live="polite"
              >
                {remaining} / {MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Flash flood warning — avoid low-lying roads."
              rows={4}
              maxLength={MAX_MESSAGE_LENGTH}
              required
              className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
            />
          </div>

          <div>
            <span
              id="severity-label"
              className="block text-sm font-semibold text-ink mb-2"
            >
              Severity
            </span>
            <SeveritySelect value={severity} onChange={setSeverity} />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-input bg-severity-alert-bg p-3 text-severity-alert-text text-sm"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {confirmation && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-input bg-green-50 border border-green-200 p-3 text-green-700 text-sm"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{confirmation}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending…' : 'Send broadcast'}
          </button>

          {!online ? (
            <p className="text-xs text-amber-700 text-center">
              You're offline — broadcasts will work again when the connection
              is back.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Posts to{' '}
              <code className="font-mono text-ink">POST /api/messages</code>.
              Delivered instantly over WebSocket to anyone currently watching
              this city.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
