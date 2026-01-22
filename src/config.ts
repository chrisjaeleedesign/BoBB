export interface BobbConfig {
  bobbPort: number;
  obbPort: number;
  childPortStart: number;
  discordToken: string;
  obbDiscordToken: string | null;
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

  // OBB token is optional - OBB features disabled if not set
  const obbToken = process.env.OBB_DISCORD_TOKEN || null;

  return {
    bobbPort: parseInt(process.env.BOBB_OPENCODE_PORT || "4096"),
    obbPort: parseInt(process.env.OBB_OPENCODE_PORT || "4095"),
    childPortStart: parseInt(process.env.BOBB_CHILD_PORT_START || "4097"),
    discordToken: token,
    obbDiscordToken: obbToken,
    opencodeCommand: process.env.OPENCODE_COMMAND || "opencode",
    healthCheckTimeout: parseInt(process.env.OPENCODE_HEALTH_TIMEOUT || "30000"),
  };
}
