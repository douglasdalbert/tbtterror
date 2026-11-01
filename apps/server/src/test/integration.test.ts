import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { io, type Socket } from "socket.io-client";
import { Pool } from "pg";
import {
  adminOverviewSchema, catalogSchema, healthSchema, matchSnapshotSchema,
  commandResultSchema, type MatchCommand, type ClientToServerEvents, type MatchSnapshot, type ServerToClientEvents,
} from "@terror/contracts";
import { createApplication } from "../app.js";
import { loadCatalog, migrate } from "../database.js";
import { Match } from "../match.js";

test("API, migrations, frozen configuration, login-free admin and socket reconnection", { timeout: 20000 }, async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required. Use a dedicated test database, never the game database.");
  }
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
  let application: ReturnType<typeof createApplication> | undefined;
  let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;
  let originalRevision: number | undefined;
  context.after(async () => {
    socket?.disconnect();
    if (application) await application.close();
    try {
      if (originalRevision !== undefined) {
        await pool.query("UPDATE game_settings SET revision = $1 WHERE id = 'default'", [originalRevision]);
      }
    } finally {
      await pool.end();
    }
  });
  await migrate(pool);
  await migrate(pool);
  assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 3);
  const catalog = await loadCatalog(pool);
  for (const definition of [...catalog.characters, ...catalog.monsters]) {
    assert.equal(definition.attributes.dexterity, 2);
    assert.equal("speed" in definition.attributes, false);
    assert.equal(definition.attributes.wisdom, 2);
    assert.equal("intelligence" in definition.attributes, false);
  }
  let clock = 0;
  const match = new Match(catalog, () => clock);
  application = createApplication(pool, match);
  application.httpServer.listen(0, "127.0.0.1");
  await once(application.httpServer, "listening");
  const address = application.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 200);
  healthSchema.parse(await health.json());
  catalogSchema.parse(await (await fetch(`${url}/api/catalog`)).json());
  const snapshot = matchSnapshotSchema.parse(await (await fetch(`${url}/api/match`)).json());
  const overview = await fetch(`${url}/api/admin/overview`);
  assert.equal(overview.status, 200);
  adminOverviewSchema.parse(await overview.json());
  assert.equal((await fetch(`${url}/api/not-found`)).status, 404);

  const client: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
    auth: { clientId: randomUUID() },
  });
  socket = client;
  const nextSnapshot = () => new Promise<MatchSnapshot>((resolve, reject) => {
    const onSnapshot = (value: MatchSnapshot) => {
      client.off("connect_error", onError);
      resolve(matchSnapshotSchema.parse(value));
    };
    const onError = (error: Error) => {
      client.off("match:snapshot", onSnapshot);
      reject(error);
    };
    client.once("match:snapshot", onSnapshot);
    client.once("connect_error", onError);
  });
  const initial = nextSnapshot();
  client.connect();
  assert.deepEqual(await initial, snapshot);
  const requested = nextSnapshot();
  client.emit("match:request");
  assert.deepEqual(await requested, snapshot);
  client.disconnect();
  const reconnected = nextSnapshot();
  client.connect();
  assert.deepEqual(await reconnected, snapshot);

  const command = async (value: MatchCommand) => commandResultSchema.parse(
    await client.timeout(3000).emitWithAck("match:command", value),
  );
  assert.deepEqual(await command({ type: "join", slot: 0, name: "AAA" }), { ok: true });
  assert.equal((await command({ type: "join", slot: 1, name: "AAA" })).ok, false);
  assert.deepEqual(await command({ type: "join", slot: 1, name: "AAB" }), { ok: true });
  assert.deepEqual(await command({ type: "ready", slot: 0, value: true }), { ok: true });
  assert.deepEqual(await command({ type: "ready", slot: 1, value: true }), { ok: true });
  clock += 3000;
  match.tick();
  assert.equal(match.snapshot().remainingMs, 7000);
  assert.deepEqual(await command({ type: "ready", slot: 0, value: false }), { ok: true });
  assert.equal(match.snapshot().phase, "lobby");
  assert.deepEqual(await command({ type: "ready", slot: 0, value: true }), { ok: true });
  assert.equal(match.snapshot().remainingMs, 10000);
  clock += 10000;
  match.tick();
  clock += 2000;
  match.tick();
  assert.equal(match.snapshot().phase, "running");
  assert.equal((await command({ type: "attribute", slot: 0, attribute: "wisdom", delta: 1 })).ok, false);
  assert.deepEqual(await command({ type: "press", slot: 0 }), { ok: true });
  assert.equal((await command({ type: "pause", slot: 0 })).ok, false);
  assert.deepEqual(await command({ type: "move", slot: 0, position: { x: 500, y: 500 } }), { ok: true });
  assert.deepEqual(await command({ type: "release", slot: 0 }), { ok: true });
  const serverSocket = application.io.sockets.sockets.get(client.id ?? "");
  assert.ok(serverSocket);
  const disconnected = once(serverSocket, "disconnect");
  client.disconnect();
  await disconnected;
  assert.equal(match.snapshot().phase, "paused");
  const reconnectActive = nextSnapshot();
  client.connect();
  const restored = await reconnectActive;
  assert.deepEqual(restored.controlSlots, [0, 1]);
  assert.deepEqual(restored.players[0]?.position, { x: 500, y: 500 });
  assert.deepEqual(await command({ type: "resume", slot: 0, value: true }), { ok: true });
  assert.equal(match.snapshot().phase, "paused");
  assert.deepEqual(await command({ type: "resume", slot: 1, value: true }), { ok: true });
  assert.equal(match.snapshot().phase, "paused");
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  clock += 3000;
  match.tick();
  assert.equal(match.snapshot().resumeRemainingMs, 7000);
  assert.deepEqual(await command({ type: "resume", slot: 0, value: false }), { ok: true });
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  assert.equal(match.snapshot().players[1]?.resumeReady, true);
  assert.deepEqual(await command({ type: "resume", slot: 0, value: true }), { ok: true });
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  clock += 10000;
  match.tick();
  assert.equal(match.snapshot().phase, "running");
  assert.deepEqual(await command({ type: "leave", slot: 0 }), { ok: true });
  assert.deepEqual(await command({ type: "leave", slot: 1 }), { ok: true });
  assert.equal(match.snapshot().phase, "lobby");

  originalRevision = catalog.revision;
  await pool.query("UPDATE game_settings SET revision = revision + 1 WHERE id = 'default'");
  await migrate(pool);
  assert.equal((await loadCatalog(pool)).revision, catalog.revision + 1);
  assert.equal(match.catalog().revision, catalog.revision);
});
