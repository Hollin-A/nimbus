interface WordmarkProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'lg';
}

export default function Wordmark({
  variant = 'dark',
  size = 'sm',
}: WordmarkProps) {
  const text = variant === 'light' ? 'text-white' : 'text-ink';
  const sizeCls =
    size === 'lg'
      ? 'text-2xl tracking-[0.22em]'
      : 'text-lg tracking-[0.18em]';

  return <span className={`font-extrabold ${sizeCls} ${text}`}>NIMBUS</span>;
}
