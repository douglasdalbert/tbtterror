import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { io, type Socket } from "socket.io-client";
import { Pool } from "pg";
import {
  adminOverviewSchema, catalogSchema, healthSchema, matchSnapshotSchema,
  type ClientToServerEvents, type MatchSnapshot, type ServerToClientEvents,
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
  assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 1);
  const catalog = await loadCatalog(pool);
  const match = new Match(catalog);
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

  originalRevision = catalog.revision;
  await pool.query("UPDATE game_settings SET revision = revision + 1 WHERE id = 'default'");
  await migrate(pool);
  assert.equal((await loadCatalog(pool)).revision, catalog.revision + 1);
  assert.equal(match.catalog().revision, catalog.revision);
});
