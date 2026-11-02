import { createApplication } from "./app.js";
import { readConfig } from "./config.js";
import { createPool, loadCatalog, migrate } from "./database.js";
import { Match } from "./match.js";

const config = readConfig(process.env);
const pool = createPool(config);
pool.on("error", (error) => {
  console.error(JSON.stringify({ event: "database_pool_error", message: error.message }));
});

try {
  await migrate(pool);
  const match = new Match(await loadCatalog(pool), undefined, config.PLAYER_VISION_RADIUS_CELLS);
  const application = createApplication(pool, match);
  await new Promise<void>((resolve, reject) => {
    application.httpServer.once("error", reject);
    application.httpServer.listen(config.PORT, "0.0.0.0", () => {
      application.httpServer.off("error", reject);
      resolve();
    });
  });
  console.info(JSON.stringify({ event: "server_ready", port: config.PORT, match: match.snapshot().id }));

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.info(JSON.stringify({ event: "server_stopping" }));
    const deadline = setTimeout(() => {
      console.error(JSON.stringify({ event: "shutdown_timeout" }));
      process.exit(1);
    }, 10000);
    deadline.unref();
    void application.close().then(() => pool.end()).then(() => {
      clearTimeout(deadline);
    }).catch((error: unknown) => {
      console.error(JSON.stringify({
        event: "shutdown_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }));
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error(JSON.stringify({
    event: "startup_failed",
    message: error instanceof Error ? error.message : "Unknown error",
  }));
  await pool.end();
  process.exitCode = 1;
}
