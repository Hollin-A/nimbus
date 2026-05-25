import { useAuth } from '../auth/useAuth';

export default function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName.split(' ')[0] ?? 'there';

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
        Home
      </p>
      <h1 className="mt-2 text-3xl md:text-5xl font-extrabold text-ink leading-[1.1]">
        Welcome back, {firstName}.
      </h1>
      <p className="mt-4 text-body text-base md:text-lg max-w-prose">
        City search and current conditions arrive next. After that, live alert
        popups scoped to the city you're watching.
      </p>
    </section>
  );
}
