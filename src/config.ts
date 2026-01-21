export interface BobbConfig {
  bobbPort: number;
  childPortStart: number;
  discordToken: string;
  opencodeCommand: string;
  healthCheckTimeout: number;
}

export function loadConfig(): BobbConfig {
  const token = process.env.BOBB_DISCORD_TOKEN;

  if (!token) {
    console.error("Error: BOBB_DISCORD_TOKEN environment variable is not set");
    console.error("Copy .env.example to .env and add your bot token");
    process.exit(1);
  }

  return {
    bobbPort: parseInt(process.env.BOBB_OPENCODE_PORT || "4096"),
    childPortStart: parseInt(process.env.BOBB_CHILD_PORT_START || "4097"),
    discordToken: token,
    opencodeCommand: process.env.OPENCODE_COMMAND || "opencode",
    healthCheckTimeout: parseInt(process.env.OPENCODE_HEALTH_TIMEOUT || "30000"),
  };
}
