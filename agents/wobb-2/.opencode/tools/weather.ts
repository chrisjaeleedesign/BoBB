import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Get current weather conditions for a given location",
  args: {
    location: tool.schema.string().describe("City name (e.g., 'London' or 'New York')"),
  },
  async execute(args) {
    try {
      // First, geocode the location
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`
      );
      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        return `Could not find location: ${args.location}`;
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // Fetch weather data
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
      );
      const weather = await weatherResponse.json();
      const current = weather.current;

      // Weather code descriptions
      const weatherCodes: Record<number, string> = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
        95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
      };

      const condition = weatherCodes[current.weather_code] || "Unknown";

      return JSON.stringify({
        location: `${name}, ${country}`,
        temperature: `${current.temperature_2m}°C`,
        humidity: `${current.relative_humidity_2m}%`,
        condition,
        wind: `${current.wind_speed_10m} km/h`,
      }, null, 2);
    } catch (error) {
      return `Error fetching weather: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
