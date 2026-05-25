import { Loader2 } from 'lucide-react';
import Wordmark from './Wordmark';

export default function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-brand text-white">
      <Wordmark variant="light" size="lg" />
      <Loader2 className="h-6 w-6 animate-spin text-white/80" />
      <p className="text-sm text-white/80">Loading your workspace…</p>
    </div>
  );
}
