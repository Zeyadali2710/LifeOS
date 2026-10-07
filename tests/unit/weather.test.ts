import { describe, expect, it } from "vitest";
import { getSydneyWeather, parseWeather, weatherWord } from "@/server/weather";

describe("weatherWord", () => {
  it("maps WMO codes", () => {
    expect(weatherWord(0)).toBe("CLEAR");
    expect(weatherWord(2)).toBe("PARTLY CLOUDY");
    expect(weatherWord(3)).toBe("CLOUDY");
    expect(weatherWord(48)).toBe("FOG");
    expect(weatherWord(53)).toBe("DRIZZLE");
    expect(weatherWord(81)).toBe("RAIN");
    expect(weatherWord(86)).toBe("SNOW");
    expect(weatherWord(96)).toBe("STORM");
    expect(weatherWord(4)).toBeNull();
  });
});

describe("parseWeather", () => {
  it("rounds and maps", () => {
    expect(parseWeather({ current: { temperature_2m: 14.7, weather_code: 2 } })).toEqual({ temp: 15, word: "PARTLY CLOUDY" });
  });
  it("returns null on garbage", () => {
    expect(parseWeather(null)).toBeNull();
    expect(parseWeather({ current: { temperature_2m: "x" } })).toBeNull();
  });
});

describe("getSydneyWeather", () => {
  const stub = (f: () => Promise<unknown>) => f as unknown as typeof fetch;
  it("returns weather on success", async () => {
    const f = stub(async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 17, weather_code: 0 } }) }));
    expect(await getSydneyWeather(f)).toEqual({ temp: 17, word: "CLEAR" });
  });
  it("is null on reject, !ok, invalid json", async () => {
    expect(await getSydneyWeather(stub(async () => { throw new Error("x"); }))).toBeNull();
    expect(await getSydneyWeather(stub(async () => ({ ok: false })))).toBeNull();
    expect(await getSydneyWeather(stub(async () => ({ ok: true, json: async () => { throw new Error("bad"); } })))).toBeNull();
  });
});
