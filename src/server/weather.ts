import { z } from "zod";

const URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-33.8688&longitude=151.2093&current=temperature_2m,weather_code&timezone=Australia%2FSydney";

export type Weather = { temp: number; word: string | null };

export function weatherWord(code: number): string | null {
  if (code === 0) return "CLEAR";
  if (code === 1 || code === 2) return "PARTLY CLOUDY";
  if (code === 3) return "CLOUDY";
  if (code === 45 || code === 48) return "FOG";
  if (code >= 51 && code <= 57) return "DRIZZLE";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "RAIN";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "SNOW";
  if (code >= 95 && code <= 99) return "STORM";
  return null;
}

const schema = z.object({ current: z.object({ temperature_2m: z.number(), weather_code: z.number().int() }) });

export function parseWeather(json: unknown): Weather | null {
  const r = schema.safeParse(json);
  if (!r.success) return null;
  return { temp: Math.round(r.data.current.temperature_2m), word: weatherWord(r.data.current.weather_code) };
}

/** Never throws; any failure -> null (Home then shows the date only). */
export async function getSydneyWeather(fetchImpl: typeof fetch = fetch): Promise<Weather | null> {
  try {
    const res = await fetchImpl(URL, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return parseWeather(await res.json());
  } catch {
    return null;
  }
}
