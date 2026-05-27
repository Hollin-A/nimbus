import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Surfaces the browser's PWA install prompt as a tidy chip in the header.
 *
 * Chrome / Edge / Samsung Internet fire `beforeinstallprompt` when the app
 * is installable; we hold the event, suppress the default mini-bar, and
 * offer a single click to install. Safari and Firefox don't fire it — the
 * chip just doesn't render there. Once installed (or dismissed) we drop
 * the event and the chip disappears.
 */
export default function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstallEvent(null);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!installEvent) return null;

  async function handleClick() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand hover:bg-brand-soft/70 transition-colors"
    >
      <Download className="h-3 w-3" aria-hidden />
      Install
    </button>
  );
}
