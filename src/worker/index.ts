import { initDb } from "../lib/initDb";
import { startBackgroundWorker } from "../lib/worker";

async function run() {
  console.log("[standalone worker] Initializing database schema...");
  await initDb();
  console.log("[standalone worker] Starting monitor loop...");
  startBackgroundWorker();
}

run().catch((err) => {
  console.error("[standalone worker] Fatal error:", err);
  process.exit(1);
});
