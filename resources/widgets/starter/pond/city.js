// Live weather for a chosen city (Open-Meteo). City mapping follows
// fishwallpaper (https://github.com/moli-xia/fishwallpaper), MIT.

export function parseCity(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const data = JSON.parse(value);
    if (typeof data.name !== "string") return null;
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      name: data.name.slice(0, 80),
      latitude: Math.max(-90, Math.min(90, latitude)),
      longitude: Math.max(-180, Math.min(180, longitude)),
    };
  } catch {
    return null;
  }
}

export function createCityWeather({ weatherFromCode, clamp, onWeather }) {
  let request = 0;
  let timer = 0;
  let active = null;

  async function fetchWeather() {
    if (!active) return;
    const ticket = ++request;
    const location = active;
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation,snowfall&timezone=auto`,
        { signal: AbortSignal.timeout(12000) },
      );
      if (!response.ok) throw new Error("network");
      const data = await response.json();
      if (ticket !== request || active !== location) return;
      const current = data.current;
      if (
        !Number.isFinite(current?.temperature_2m) ||
        !Number.isFinite(current?.weather_code)
      )
        return;
      const weather = weatherFromCode(current.weather_code);
      let rainAmount = null;
      let snowAmount = null;
      if (weather === "rain" && Number.isFinite(current.precipitation))
        rainAmount = clamp(0.15 + current.precipitation / 8, 0.15, 1);
      if (weather === "snow" && Number.isFinite(current.snowfall))
        snowAmount = clamp(0.2 + current.snowfall / 1.5, 0.2, 1);
      onWeather({ weather, rainAmount, snowAmount });
    } catch {
      // Keep the pond as it is when the forecast cannot be reached.
    }
  }

  return {
    setLocation(location) {
      const same =
        location &&
        active &&
        location.name === active.name &&
        location.latitude === active.latitude &&
        location.longitude === active.longitude;
      if (!location) {
        request += 1;
        active = null;
        clearInterval(timer);
        timer = 0;
        return;
      }
      active = location;
      if (!same) void fetchWeather();
      if (!timer)
        timer = setInterval(() => void fetchWeather(), 15 * 60 * 1000);
    },
    stop() {
      request += 1;
      active = null;
      clearInterval(timer);
      timer = 0;
    },
  };
}
