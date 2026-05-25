import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <div className="max-w-3xl">
        <h1 className="text-4xl md:text-6xl font-extrabold text-ink leading-[1.05] tracking-tight">
          Live weather and city alerts, in one place.
        </h1>
        <p className="mt-6 text-base md:text-lg text-body max-w-prose">
          Sign in, pick a city, and get current conditions plus real-time alert
          popups scoped to that city. Built as an installable PWA so you can
          pin it to your dock or home screen.
        </p>
        <div className="mt-10">
          <Link
            to="/login"
            className="inline-flex items-center rounded-full bg-brand px-6 py-3 text-white font-semibold hover:bg-brand-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
