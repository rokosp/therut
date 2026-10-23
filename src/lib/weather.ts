/** Tee-time forecast from Open-Meteo (free, no key). Works up to about two weeks ahead. */
export interface TeeWeather {
  label: string;
  temp: number;
  rain: number | null;
  wind: number;
}

const places = new Map<string, Promise<{ lat: number; lon: number } | null>>();
const forecasts = new Map<string, Promise<TeeWeather | null>>();

function describe(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Mixed';
}

function locate(place: string) {
  if (!places.has(place)) {
    places.set(
      place,
      fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`)
        .then((r) => r.json())
        .then((j) => (j.results?.[0] ? { lat: j.results[0].latitude, lon: j.results[0].longitude } : null))
        .catch(() => null),
    );
  }
  return places.get(place)!;
}

/** Forecast for the hour a match tees off, or null when it's too far out or unknown. */
export function teeWeather(city: string | null | undefined, startsAt: string): Promise<TeeWeather | null> {
  const when = new Date(startsAt);
  const days = (when.getTime() - Date.now()) / 86400000;
  if (!city || days < -0.1 || days > 15) return Promise.resolve(null);
  const hour = when.toISOString().slice(0, 13); // UTC, e.g. 2026-10-25T08
  const key = `${city}|${hour}`;
  if (!forecasts.has(key)) {
    forecasts.set(
      key,
      locate(city)
        .then(async (p) => {
          if (!p) return null;
          const day = hour.slice(0, 10);
          const url =
            `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
            `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m` +
            `&timezone=GMT&start_date=${day}&end_date=${day}`;
          const j = await (await fetch(url)).json();
          const i = (j.hourly?.time as string[] | undefined)?.findIndex((t) => t.startsWith(hour)) ?? -1;
          if (i < 0) return null;
          return {
            label: describe(j.hourly.weather_code[i]),
            temp: Math.round(j.hourly.temperature_2m[i]),
            rain: j.hourly.precipitation_probability?.[i] ?? null,
            wind: Math.round(j.hourly.wind_speed_10m[i]),
          };
        })
        .catch(() => null),
    );
  }
  return forecasts.get(key)!;
}

export const weatherText = (w: TeeWeather) =>
  [w.label, `${w.temp}°`, w.rain != null ? `${w.rain}% rain` : null, `wind ${w.wind} km/h`].filter(Boolean).join(' · ');
