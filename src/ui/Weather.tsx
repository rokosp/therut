import { useEffect, useState } from 'react';

import { teeWeather, weatherText, type TeeWeather } from '@/lib/weather';
import { T } from '@/ui/components';

/** One line with the forecast at tee time. Shows nothing if there's no forecast yet. */
export function WeatherLine({
  city,
  startsAt,
  light,
}: {
  city?: string | null;
  startsAt?: string | null;
  light?: boolean;
}) {
  const [w, setW] = useState<TeeWeather | null>(null);
  useEffect(() => {
    let live = true;
    if (startsAt) teeWeather(city, startsAt).then((x) => live && setW(x));
    return () => {
      live = false;
    };
  }, [city, startsAt]);
  if (!w) return null;
  return (
    <T variant="label" muted={!light}>
      Forecast: {weatherText(w)}
    </T>
  );
}
