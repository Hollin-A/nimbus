import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { ApiError, pushMessage } from '../api/client';
import { useAuth } from '../auth/useAuth';
import CitySearch from '../components/CitySearch';
import SeveritySelect from '../components/SeveritySelect';
import { useOnline } from '../lib/useOnline';
import {
  BROADCAST_TARGETS_KEY,
  loadRecent,
  saveRecent,
} from '../lib/recentCities';
import type { City, Severity } from '../types';

const MAX_MESSAGE_LENGTH = 280;
const CONFIRMATION_TIMEOUT_MS = 4_000;

// The submit lifecycle as a discriminated union, so impossible combinations
// — submitting while an error shows, or an error and a confirmation at once —
// are unrepresentable rather than merely avoided by careful setState order.
type Submit =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; confirmation: string }
  | { status: 'error'; message: string };

interface FormState {
  city: City | null;
  message: string;
  severity: Severity;
  submit: Submit;
}

type Action =
  | { type: 'setCity'; city: City | null }
  | { type: 'setMessage'; message: string }
  | { type: 'setSeverity'; severity: Severity }
  | { type: 'submitStart' }
  | { type: 'submitSuccess'; confirmation: string }
  | { type: 'submitError'; message: string }
  | { type: 'dismissConfirmation' };

const initialState: FormState = {
  city: null,
  message: '',
  severity: 'info',
  submit: { status: 'idle' },
};

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'setCity':
      return { ...state, city: action.city };
    case 'setMessage':
      return { ...state, message: action.message };
    case 'setSeverity':
      return { ...state, severity: action.severity };
    case 'submitStart':
      return { ...state, submit: { status: 'submitting' } };
    case 'submitSuccess':
      // Clear the message but keep city + severity so the operator can fire
      // follow-ups to the same place quickly.
      return {
        ...state,
        message: '',
        submit: { status: 'success', confirmation: action.confirmation },
      };
    case 'submitError':
      return { ...state, submit: { status: 'error', message: action.message } };
    case 'dismissConfirmation':
      return state.submit.status === 'success'
        ? { ...state, submit: { status: 'idle' } }
        : state;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      return 'That broadcast is invalid. Check the city and message.';
    }
    if (err.status === 401) return 'Your session has expired. Sign in again.';
    // Defensive — the route guard normally keeps non-admins away, but a role
    // demoted mid-session could land here before the next refresh redirects.
    if (err.status === 403) return 'You do not have permission to broadcast.';
    if (err.status === 429) {
      return "You're sending broadcasts too quickly — try again in a moment.";
    }
    return err.message;
  }
  return 'Could not reach the server.';
}

export default function BroadcastPage() {
  const { token, user } = useAuth();
  const online = useOnline();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { city: targetCity, message, severity, submit } = state;
  // Cities this admin has broadcast to, for quick re-targeting. Kept under
  // its own key so it never mixes with the home page's viewed-cities list.
  const [recentTargets, setRecentTargets] = useState<City[]>(() =>
    loadRecent(BROADCAST_TARGETS_KEY),
  );

  const submitting = submit.status === 'submitting';
  const error = submit.status === 'error' ? submit.message : null;
  const confirmation = submit.status === 'success' ? submit.confirmation : null;

  // Tracks the in-flight submit so it can be cancelled if the page unmounts.
  const abortRef = useRef<AbortController | null>(null);

  // Auto-dismiss the success confirmation.
  useEffect(() => {
    if (!confirmation) return;
    const handle = setTimeout(
      () => dispatch({ type: 'dismissConfirmation' }),
      CONFIRMATION_TIMEOUT_MS,
    );
    return () => clearTimeout(handle);
  }, [confirmation]);

  // Abort any in-flight broadcast if the operator navigates away mid-send,
  // so the request is cancelled and no state update lands after unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Broadcasting is admin-only. Redirect a non-admin who reaches the route
  // directly (the nav doesn't surface it to them). Placed after all hooks
  // so the hook order stays stable; the server's requireRole is the real
  // gate. Checked after hooks per the rules of hooks.
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

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

    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'submitStart' });

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
        { signal: controller.signal },
      );
      const where = targetCity.country
        ? `${targetCity.name}, ${targetCity.country}`
        : targetCity.name;
      dispatch({
        type: 'submitSuccess',
        confirmation: `Broadcast sent to ${where}.`,
      });
      // Remember where we just broadcast so it's one click away next time.
      setRecentTargets((prev) =>
        saveRecent(targetCity, prev, BROADCAST_TARGETS_KEY),
      );
    } catch (err) {
      // Cancelled by an unmount — the component may be gone; don't touch state.
      if (controller.signal.aborted) return;
      dispatch({ type: 'submitError', message: errorMessage(err) });
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
          {/* Lock every input while a send is in flight — the operator must
              not be able to change the payload out from under the request. */}
          <fieldset
            disabled={submitting}
            className="space-y-5 border-0 p-0 m-0 min-w-0"
          >
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
                    onClick={() => dispatch({ type: 'setCity', city: null })}
                    aria-label="Clear selected city"
                    className="text-muted hover:text-ink transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <CitySearch
                  recentCities={recentTargets}
                  onSelect={(city) => dispatch({ type: 'setCity', city })}
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
                onChange={(e) =>
                  dispatch({ type: 'setMessage', message: e.target.value })
                }
                placeholder="Flash flood warning — avoid low-lying roads."
                rows={4}
                maxLength={MAX_MESSAGE_LENGTH}
                required
                className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none"
              />
            </div>

            <div>
              <span
                id="severity-label"
                className="block text-sm font-semibold text-ink mb-2"
              >
                Severity
              </span>
              <SeveritySelect
                value={severity}
                onChange={(value) =>
                  dispatch({ type: 'setSeverity', severity: value })
                }
              />
            </div>
          </fieldset>

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
