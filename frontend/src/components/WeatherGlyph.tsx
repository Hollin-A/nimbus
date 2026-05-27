import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { WeatherIcon } from '../types';

const GLYPHS: Record<WeatherIcon, LucideIcon> = {
  clear: Sun,
  'partly-cloudy': CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  thunderstorm: Zap,
};

interface WeatherGlyphProps {
  icon: WeatherIcon;
  className?: string;
}

export default function WeatherGlyph({ icon, className }: WeatherGlyphProps) {
  const Icon = GLYPHS[icon];
  return <Icon className={className} aria-hidden="true" />;
}
