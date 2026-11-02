import assert from "node:assert/strict";
import { test } from "node:test";
import { terrainLayout, type Catalog, type MatchCommand } from "@terror/contracts";
import { readConfig } from "../config.js";
import { Match } from "../match.js";

const catalog: Catalog = {
  revision: 1,
  settings: { maxPlayers: 8, minimumTouchPoints: 10, countdownSeconds: 10, moduleCells: 7, rotationStepDegrees: 60 },
  characters: [{ id: "test", name: "Test", attributes: { strength: 2, dexterity: 2, wisdom: 2 }, health: 3 }],
  monsters: [{
    id: "test", name: "Test", attributes: { strength: 2, dexterity: 2, wisdom: 2 },
    movementMultiplier: 1.2, capabilities: ["sleep"], trapLimit: 3, sleepingVisionMultiplier: 0.1,
  }],
};

test("match keeps its own configuration copy and returns isolated snapshots", () => {
  const source = structuredClone(catalog);
  const match = new Match(source);
  source.revision = 8;
  const returned = match.catalog();
  returned.revision = 9;
  assert.equal(match.catalog().revision, 1);
  assert.equal(match.snapshot().catalogRevision, 1);
  assert.equal(match.snapshot().id, match.snapshot().id);
});

test("a fresh server match gets a new identity instead of restoring state", () => {
  assert.notEqual(new Match(catalog).snapshot().id, new Match(catalog).snapshot().id);
});

function fixture() {
  let time = 0;
  const match = new Match(catalog, () => time);
  match.connect("tablet");
  const command = (value: MatchCommand) => {
    const result = match.command("tablet", value);
    assert.deepEqual(result, { ok: true });
  };
  const advance = (ms: number) => { time += ms; match.tick(); };
  return { match, command, advance };
}

test("readiness starts exactly ten seconds, cancels globally and restarts from ten", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "join", slot: 1, name: "AAB" });
  command({ type: "ready", slot: 0, value: true });
  assert.equal(match.snapshot().phase, "lobby");
  command({ type: "ready", slot: 1, value: true });
  assert.equal(match.snapshot().remainingMs, 10000);
  advance(3000);
  assert.equal(match.snapshot().remainingMs, 7000);
  command({ type: "ready", slot: 0, value: false });
  assert.equal(match.snapshot().phase, "lobby");
  assert.equal(match.snapshot().remainingMs, 0);
  assert.equal(match.snapshot().players[1]?.ready, true);
  advance(20000);
  command({ type: "ready", slot: 0, value: true });
  assert.equal(match.snapshot().remainingMs, 10000);
  advance(9999);
  assert.equal(match.snapshot().phase, "countdown");
  advance(1);
  assert.equal(match.snapshot().phase, "chapter");
  assert.equal(match.snapshot().simulationMs, 0);
  const layout = terrainLayout(1920, 1200, 1);
  const cells = layout.placements.flatMap((p) => p.cells);
  const positions = match.snapshot().players.map((p) => p.position);
  assert.notDeepEqual(positions[0], positions[1]);
  for (const position of positions) assert.ok(cells.some((c) => c.x === position.x && c.y === position.y));
  advance(2000);
  assert.equal(match.snapshot().phase, "running");
  command({ type: "press", slot: 0 });
  command({ type: "move", slot: 0, position: { x: -500, y: 90000 } });
  command({ type: "release", slot: 0 });
  assert.equal(match.snapshot().players[0]?.position.x, layout.area.x + layout.tokenDiameter / 2);
  assert.equal(match.snapshot().players[0]?.position.y, layout.area.y + layout.area.height - layout.tokenDiameter / 2);
});

test("unused points do not prevent starting, but no configuration can change after countdown", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "ready", slot: 0, value: true });
  advance(10000);
  for (const value of [
    { type: "attribute", slot: 0, attribute: "wisdom", delta: 1 },
    { type: "scale", slot: 0, delta: 0.05 },
    { type: "join", slot: 1, name: "AAB" },
    { type: "viewport", width: 1000, height: 600 },
    { type: "ready", slot: 0, value: false },
  ]) assert.equal(match.command("tablet", value).ok, false);
  assert.deepEqual(match.snapshot().players[0]?.attributes, { strength: 1, dexterity: 1, wisdom: 1 });
});

test("pause freezes positions, simulation and chapter timer until every connected player resumes", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "join", slot: 1, name: "AAB" });
  command({ type: "ready", slot: 0, value: true });
  command({ type: "ready", slot: 1, value: true });
  advance(10000);
  advance(500);
  command({ type: "pause", slot: 0 });
  const frozen = match.snapshot();
  advance(90000);
  assert.deepEqual(match.snapshot(), frozen);
  assert.equal(match.command("tablet", { type: "press", slot: 0 }).ok, false);
  command({ type: "resume", slot: 0, value: true });
  assert.equal(match.snapshot().phase, "paused");
  command({ type: "resume", slot: 0, value: false });
  command({ type: "resume", slot: 1, value: true });
  assert.equal(match.snapshot().phase, "paused");
  command({ type: "resume", slot: 0, value: true });
  assert.equal(match.snapshot().phase, "paused");
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  advance(10000);
  assert.equal(match.snapshot().phase, "chapter");
  assert.equal(match.snapshot().remainingMs, 1500);
  advance(1500);
  advance(1000);
  assert.equal(match.snapshot().simulationMs, 1000);
  command({ type: "pause", slot: 1 });
  advance(30000);
  assert.equal(match.snapshot().simulationMs, 1000);
  assert.equal(match.command("tablet", { type: "move", slot: 0, position: { x: 10, y: 10 } }).ok, false);
});

test("disconnect pauses only participating clients, reconnection restores ownership and requires collective resume", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "ready", slot: 0, value: true });
  advance(12000);
  advance(2000);
  match.connect("spectator");
  match.disconnect("spectator");
  assert.equal(match.snapshot().phase, "running");
  command({ type: "press", slot: 0 });
  match.disconnect("tablet");
  assert.equal(match.snapshot().phase, "paused");
  assert.equal(match.snapshot().players[0]?.pressed, false);
  assert.equal(match.snapshot().players[0]?.connected, false);
  const frozen = match.snapshot().simulationMs;
  advance(20000);
  assert.equal(match.snapshot().simulationMs, frozen);
  match.connect("other");
  assert.equal(match.command("other", { type: "resume", slot: 0, value: true }).ok, false);
  match.connect("tablet");
  assert.deepEqual(match.snapshot("tablet").controlSlots, [0]);
  assert.deepEqual(match.snapshot("other").controlSlots, []);
  command({ type: "resume", slot: 0, value: true });
  assert.equal(match.snapshot().phase, "paused");
  advance(10000);
  assert.equal(match.snapshot().phase, "running");
  command({ type: "leave", slot: 0 });
  assert.equal(match.snapshot().phase, "lobby");
  assert.equal(match.snapshot().players.length, 0);
  assert.equal(match.snapshot().simulationMs, 0);
});

test("resume countdown cancels and restarts at ten without advancing the paused world", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "join", slot: 1, name: "AAB" });
  command({ type: "ready", slot: 0, value: true });
  command({ type: "ready", slot: 1, value: true });
  advance(10000);
  advance(2000);
  advance(1234);
  command({ type: "pause", slot: 0 });
  const frozen = match.snapshot();
  command({ type: "resume", slot: 0, value: true });
  advance(20000);
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  command({ type: "resume", slot: 1, value: true });
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  advance(3000);
  command({ type: "resume", slot: 1, value: true });
  assert.equal(match.snapshot().resumeRemainingMs, 7000);
  command({ type: "resume", slot: 0, value: false });
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  assert.equal(match.snapshot().players[1]?.resumeReady, true);
  advance(30000);
  command({ type: "resume", slot: 0, value: true });
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  advance(9999);
  assert.equal(match.snapshot().phase, "paused");
  assert.equal(match.snapshot().resumeRemainingMs, 1);
  assert.equal(match.snapshot().simulationMs, frozen.simulationMs);
  assert.deepEqual(match.snapshot().players.map((p) => p.position), frozen.players.map((p) => p.position));
  assert.equal(match.command("tablet", { type: "press", slot: 0 }).ok, false);
  advance(1);
  assert.equal(match.snapshot().phase, "running");
  assert.equal(match.snapshot().simulationMs, frozen.simulationMs);
  assert.ok(match.snapshot().players.every((p) => !p.resumeReady));
  advance(100);
  assert.equal(match.snapshot().simulationMs, frozen.simulationMs + 100);
});

test("disconnect and confirmed exit cancel an in-progress resume countdown", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "join", slot: 1, name: "AAB" });
  command({ type: "ready", slot: 0, value: true });
  command({ type: "ready", slot: 1, value: true });
  advance(10000);
  command({ type: "pause", slot: 0 });
  command({ type: "resume", slot: 0, value: true });
  command({ type: "resume", slot: 1, value: true });
  advance(4000);
  match.disconnect("tablet");
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  assert.ok(match.snapshot().players.every((p) => !p.resumeReady));
  match.connect("tablet");
  command({ type: "resume", slot: 0, value: true });
  command({ type: "resume", slot: 1, value: true });
  assert.equal(match.snapshot().resumeRemainingMs, 10000);
  advance(4000);
  command({ type: "leave", slot: 1 });
  assert.equal(match.snapshot().phase, "paused");
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  assert.equal(match.snapshot().players[0]?.resumeReady, true);
  command({ type: "resume", slot: 0, value: false });
  command({ type: "resume", slot: 0, value: true });
  advance(9999);
  assert.equal(match.snapshot().remainingMs, 2000);
  assert.equal(match.snapshot().phase, "paused");
  command({ type: "leave", slot: 0 });
  assert.equal(match.snapshot().phase, "lobby");
  assert.equal(match.snapshot().resumeRemainingMs, 0);
  assert.equal(match.snapshot().remainingMs, 0);
});

test("pressed tokens centrally block all own actions but not another player's controls", () => {
  const { match, command } = fixture();
  command({ type: "join", slot: 0, name: "AAA" });
  command({ type: "join", slot: 1, name: "AAB" });
  command({ type: "press", slot: 0 });
  for (const value of [
    { type: "leave", slot: 0 }, { type: "ready", slot: 0, value: true },
    { type: "attribute", slot: 0, attribute: "strength", delta: 1 },
    { type: "scale", slot: 0, delta: 0.05 },
  ]) {
    const result = match.command("tablet", value);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /enquanto em movimento/);
  }
  command({ type: "attribute", slot: 1, attribute: "wisdom", delta: 1 });
  command({ type: "release", slot: 0 });
  command({ type: "attribute", slot: 0, attribute: "strength", delta: 1 });
  assert.equal(match.command("tablet", { type: "join", slot: 2, name: "AAA" }).ok, false);
  assert.equal(match.command("tablet", { type: "join", slot: 8, name: "ZZZ" }).ok, false);
  command({ type: "viewport", width: 320, height: 320 });
  for (let i = 0; i < 20; i++) command({ type: "scale", slot: 0, delta: 0.05 });
  assert.equal(match.command("tablet", { type: "ready", slot: 0, value: true }).ok, false);
});

test("configuration rejects missing or example secrets without exposing them", () => {
  assert.throws(() => readConfig({}), /Invalid server configuration/);
  const placeholder = "replace-with-a-random-password";
  assert.throws(() => readConfig({
    POSTGRES_PASSWORD: placeholder,
  }), (error: unknown) => error instanceof Error && !error.message.includes(placeholder));
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
  }).PORT, 3000);
});
