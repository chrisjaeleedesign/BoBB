import { loadConfig } from "./config";
import { OpenCodeManager } from "./opencode-manager";
import { runMainApp } from "./index";

async function main() {
  console.log("=== BoBB Startup Orchestrator ===\n");

  const config = loadConfig();
  const opencodeManager = new OpenCodeManager(config.opencodeCommand, config.healthCheckTimeout);

  // 1. Start BoBB's OpenCode server (runs from agents/bobb/ directory)
  const bobbDir = `${process.cwd()}/agents/bobb`;
  console.log(`Starting OpenCode server on port ${config.bobbPort} (from ${bobbDir})...`);
  try {
    await opencodeManager.startServer("bobb", config.bobbPort, bobbDir);
  } catch (error) {
    console.error(`Failed to start OpenCode server: ${error}`);
    console.error("\nMake sure 'opencode' is installed and in your PATH.");
    console.error("You can install it with: npm install -g @opencode-ai/cli");
    process.exit(1);
  }

  // 2. Run the main application
  console.log("\nStarting Discord thin client...\n");
  await runMainApp({ config, opencodeManager });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
