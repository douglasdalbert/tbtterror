import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { io, type Socket } from "socket.io-client";
import { Pool } from "pg";
import {
  adminOverviewSchema, cellDimensions, hexDirections, publicCatalogSchema, healthSchema, matchSnapshotSchema,
  commandResultSchema, type MatchCommand, type ClientToServerEvents, type MatchSnapshot, type ServerToClientEvents,
} from "@terror/contracts";
import { createApplication } from "../app.js";
import { loadCatalog, migrate } from "../database.js";
import { Match } from "../match.js";
import { terrainRoute } from "./terrain-route.js";

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
  await context.test("Socket.IO validates held door/window commands, cancellation and completion", async (context) => {
    if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must point to a dedicated test database.");
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 5000 });
    let clock = 0;
    const match = new Match(await loadCatalog(pool), () => clock, 12, 100, 1000, 1.2, () => "window-1");
    const application = createApplication(pool, match);
    let client: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;
    context.after(async () => {
      client?.disconnect();
      await application.close();
      await pool.end();
    });
    application.httpServer.listen(0, "127.0.0.1");
    await once(application.httpServer, "listening");
    const address = application.httpServer.address();
    assert.ok(address && typeof address !== "string");
    client = io(`http://127.0.0.1:${address.port}`, {
      autoConnect: false, transports: ["websocket"], reconnection: false, auth: { clientId: randomUUID() },
    });
    const socket = client;
    const connected = new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    socket.connect();
    await connected;
    const command = async (value: MatchCommand) => {
      const result = commandResultSchema.parse(await socket.timeout(3000).emitWithAck("match:command", value));
      const next = new Promise<MatchSnapshot>((resolve) => socket.once("match:snapshot", resolve));
      socket.emit("match:request");
      return { result, snapshot: matchSnapshotSchema.parse(await next) };
    };
    assert.deepEqual((await command({ type: "viewport", width: 1000, height: 800 })).result, { ok: true });
    assert.deepEqual((await command({ type: "join", slot: 0, name: "AAA", color: "red" })).result, { ok: true });
    assert.deepEqual((await command({ type: "attribute", slot: 0, attribute: "dexterity", delta: 1 })).result, { ok: true });
    assert.deepEqual((await command({ type: "ready", slot: 0, value: true })).result, { ok: true });
    clock += 10000;
    match.tick();
    clock += 2000;
    match.tick();
    const state = match.snapshot();
    const door = state.exploredTerrainCells.flatMap((cell) => cell.gates.flatMap((gate) =>
      gate.kind === "door" ? [{ q: cell.q, r: cell.r, direction: gate.direction, state: gate.state }] : [],
    ))[0];
    assert.ok(door);
    const offset = hexDirections[door.direction]!;
    const route = terrainRoute(state, door) ?? terrainRoute(state, { q: door.q + offset.q, r: door.r + offset.r });
    assert.ok(route);
    const dimensions = cellDimensions(1);
    for (const cell of route) {
      assert.deepEqual((await command({ type: "press", slot: 0 })).result, { ok: true });
      clock += 250;
      assert.deepEqual((await command({ type: "move", slot: 0, position: {
        x: 500 + dimensions.width * (cell.q + cell.r / 2), y: 400 + dimensions.radius * 1.5 * cell.r,
      } })).result, { ok: true });
      assert.deepEqual((await command({ type: "release", slot: 0 })).result, { ok: true });
    }
    const target = { q: door.q, r: door.r, direction: door.direction };
    const action = door.state === "open" ? "close" : "open";
    const started = await command({ type: "door-action", slot: 0, target, action });
    assert.deepEqual(started.result, { ok: true });
    assert.equal(started.snapshot.activeDoorActions[0]?.action, action);
    clock += 500;
    const cancelled = await command({ type: "cancel-door-action", slot: 0, target, action });
    assert.equal(cancelled.snapshot.activeDoorActions.length, 0);
    const restarted = await command({ type: "door-action", slot: 0, target, action });
    assert.deepEqual(restarted.result, { ok: true });
    clock += 999;
    const progress = await command({ type: "cancel-door-action", slot: 1, target, action });
    assert.equal(progress.result.ok, false);
    assert.equal(progress.snapshot.activeDoorActions.length, 1);
    assert.ok(progress.snapshot.simulationTurns - progress.snapshot.activeDoorActions[0]!.startedTurn < 1);
    clock += 1;
    const completed = await command({ type: "cancel-door-action", slot: 0, target, action });
    assert.equal(completed.snapshot.activeDoorActions.length, 0);
    assert.equal(completed.snapshot.exploredTerrainCells.find((cell) => cell.q === door.q && cell.r === door.r)
      ?.gates.find((gate) => gate.kind === "door")?.state, action === "open" ? "open" : "closed");
    if (action === "close") {
      assert.deepEqual((await command({ type: "door-action", slot: 0, target, action: "open" })).result, { ok: true });
      clock += 1000;
      match.tick();
    }
    const windowState = match.snapshot();
    const window = windowState.exploredTerrainCells.flatMap((cell) => cell.gates.flatMap((gate) => {
      if (gate.kind !== "window") return [];
      const offset = hexDirections[gate.direction]!;
      const destination = windowState.exploredTerrainCells.find((other) =>
        other.q === cell.q + offset.q && other.r === cell.r + offset.r && other.terrainType !== "wall");
      return destination ? [{ q: cell.q, r: cell.r, direction: gate.direction, destination }] : [];
    }))[0];
    assert.ok(window);
    const windowRoute = terrainRoute(windowState, window);
    assert.ok(windowRoute);
    for (const cell of windowRoute) {
      assert.deepEqual((await command({ type: "press", slot: 0 })).result, { ok: true });
      clock += 250;
      assert.deepEqual((await command({ type: "move", slot: 0, position: {
        x: 500 + dimensions.width * (cell.q + cell.r / 2), y: 400 + dimensions.radius * 1.5 * cell.r,
      } })).result, { ok: true });
      assert.deepEqual((await command({ type: "release", slot: 0 })).result, { ok: true });
    }
    const windowTarget = { q: window.q, r: window.r, direction: window.direction };
    const jump = await command({ type: "door-action", slot: 0, target: windowTarget, action: "jump-window" });
    assert.deepEqual(jump.result, { ok: true });
    const beforeJump = jump.snapshot.players[0]!.position;
    clock += 999;
    const jumping = await command({ type: "cancel-door-action", slot: 1, target: windowTarget, action: "jump-window" });
    assert.equal(jumping.result.ok, false);
    assert.deepEqual(jumping.snapshot.players[0]!.position, beforeJump);
    assert.equal(jumping.snapshot.activeDoorActions[0]?.action, "jump-window");
    clock += 1;
    const landed = await command({ type: "cancel-door-action", slot: 0, target: windowTarget, action: "jump-window" });
    assert.equal(landed.snapshot.activeDoorActions.length, 0);
    assert.deepEqual(landed.snapshot.players[0]!.position, {
      x: 500 + dimensions.width * (window.destination.q + window.destination.r / 2),
      y: 400 + dimensions.radius * 1.5 * window.destination.r,
    });
  });
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
  const publicCatalog = publicCatalogSchema.parse(await (await fetch(`${url}/api/catalog`)).json());
  assert.ok(publicCatalog.monsters.every((monster) => !("attributes" in monster) && !("capabilities" in monster)));
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
  assert.deepEqual(await command({ type: "join", slot: 0, name: "AAA", color: "red" }), { ok: true });
  assert.equal((await command({ type: "join", slot: 1, name: "AAA", color: "blue" })).ok, false);
  assert.equal((await command({ type: "join", slot: 1, name: "AAB", color: "red" })).ok, false);
  assert.deepEqual(await command({ type: "join", slot: 1, name: "AAB", color: "blue" }), { ok: true });
  assert.deepEqual(match.snapshot().players.map(({ color }) => color), ["red", "blue"]);
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
  const beforeMove = match.snapshot().players[0]!.position;
  assert.deepEqual(await command({ type: "press", slot: 0 }), { ok: true });
  assert.equal((await command({ type: "pause", slot: 0 })).ok, false);
  clock += 100;
  match.tick();
  assert.deepEqual(await command({ type: "move", slot: 0, position: { x: 500, y: 500 } }), { ok: true });
  assert.deepEqual(await command({ type: "release", slot: 0 }), { ok: true });
  const moved = match.snapshot().players[0]!.position;
  assert.ok(Math.hypot(moved.x - beforeMove.x, moved.y - beforeMove.y)
    <= cellDimensions(1).width * 0.5 * 1.1 * 0.1 + 0.01);
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
  assert.deepEqual(restored.players[0]?.position, moved);
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
