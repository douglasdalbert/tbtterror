import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { once } from "node:events";
import { io } from "socket.io-client";
import {
  adminOverviewSchema, catalogSchema, healthSchema, matchSnapshotSchema,
} from "../packages/contracts/dist/index.js";

const environment = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const gameUrl = process.env.GAME_URL ?? `http://127.0.0.1:${environment.GAME_PORT ?? 8080}`;
const adminUrl = process.env.ADMIN_URL ?? `http://127.0.0.1:${environment.ADMIN_PORT ?? 8081}`;

async function json(path, schema) {
  const response = await fetch(path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return schema.parse(await response.json());
}

await json(`${gameUrl}/api/health`, healthSchema);
const catalog = await json(`${gameUrl}/api/catalog`, catalogSchema);
const snapshot = await json(`${gameUrl}/api/match`, matchSnapshotSchema);
assert.equal(snapshot.catalogRevision, catalog.revision);
const gamePage = await fetch(gameUrl, { signal: AbortSignal.timeout(5000) });
assert.match(await gamePage.text(), /Terror — tabuleiro/);
await json(`${gameUrl}/api/admin/overview`, adminOverviewSchema);

const socket = io(gameUrl, { autoConnect: false, transports: ["websocket"], reconnection: false });
try {
  const connected = once(socket, "match:snapshot", { signal: AbortSignal.timeout(5000) });
  socket.connect();
  assert.deepEqual(matchSnapshotSchema.parse((await connected)[0]), snapshot);
  const requested = once(socket, "match:snapshot", { signal: AbortSignal.timeout(5000) });
  socket.emit("match:request");
  assert.deepEqual(matchSnapshotSchema.parse((await requested)[0]), snapshot);
  socket.disconnect();
  const reconnected = once(socket, "match:snapshot", { signal: AbortSignal.timeout(5000) });
  socket.connect();
  assert.deepEqual(matchSnapshotSchema.parse((await reconnected)[0]), snapshot);
} finally {
  socket.disconnect();
}
if (process.env.CHECK_ADMIN === "1") {
  const page = await fetch(adminUrl, { signal: AbortSignal.timeout(5000) });
  assert.match(await page.text(), /Terror — administração/);
  await json(`${adminUrl}/api/admin/overview`, adminOverviewSchema);
}
console.info("Stack verificada: HTTP, PostgreSQL, conteúdo, admin sem login e WebSocket/reconexão.");
