import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axialFromPoint, cellDimensions, hexDirections, terrainLayout,
  type Catalog, type MatchCommand, type DoorAction,
} from "@terror/contracts";
import { readConfig } from "../config.js";
import { Match } from "../match.js";
import { terrainRoute } from "./terrain-route.js";

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

test("player colors are unique across the match and released when a player leaves", () => {
  const { match, command } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  const duplicate = match.command("tablet", { type: "join", slot: 1, name: "AAB", color: "red" });
  assert.deepEqual(duplicate, { ok: false, error: "A cor escolhida já está em uso. Escolha outra cor." });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
  assert.deepEqual(match.snapshot().players.map(({ color }) => color), ["red", "blue"]);
  command({ type: "leave", slot: 0 });
  command({ type: "join", slot: 2, name: "AAC", color: "red" });
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

function doorFixture(strength = 3, turnDurationMs = 1000, dexterity = 1, seed?: string) {
  let time = 0;
  const match = new Match(catalog, () => time, 12, 100, turnDurationMs, 1.2, seed ? () => seed : undefined);
  match.connect("tablet");
  const command = (value: MatchCommand) => assert.deepEqual(match.command("tablet", value), { ok: true });
  const advance = (ms: number) => { time += ms; match.tick(); };
  command({ type: "viewport", width: 1000, height: 800 });
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
  for (const slot of [0, 1]) {
    for (let point = 1; point < strength; point++) command({ type: "attribute", slot, attribute: "strength", delta: 1 });
    for (let point = 1; point < dexterity; point++) command({ type: "attribute", slot, attribute: "dexterity", delta: 1 });
  }
  command({ type: "ready", slot: 0, value: true });
  command({ type: "ready", slot: 1, value: true });
  advance(10000);
  advance(2000);
  const snapshot = () => match.snapshot("tablet");
  const door = () => {
    for (const cell of snapshot().exploredTerrainCells) {
      for (const gate of cell.gates) {
        if (gate.kind === "door") return { q: cell.q, r: cell.r, direction: gate.direction, state: gate.state };
      }
    }
    throw new Error("Porta não descoberta na arena de teste.");
  };
  const goTo = (target: { q: number; r: number }, slot = 0) => {
    const state = snapshot();
    const { width, height, scale, hexSideTokenRatio } = state.arena;
    const path = terrainRoute(state, target, slot);
    if (!path) return false;
    const dimensions = cellDimensions(scale, hexSideTokenRatio);
    for (const cell of path) {
      command({ type: "press", slot });
      advance(250);
      const position = {
        x: width / 2 + dimensions.width * (cell.q + cell.r / 2),
        y: height / 2 + dimensions.radius * 1.5 * cell.r,
      };
      command({ type: "move", slot, position });
      command({ type: "release", slot });
      const actual = snapshot().players[slot]!.position;
      assert.ok(Math.hypot(actual.x - position.x, actual.y - position.y) < 1e-6);
    }
    return true;
  };
  const act = (action: DoorAction, slot = 0) => {
    const { q, r, direction } = door();
    command({ type: "door-action", slot, target: { q, r, direction }, action });
  };
  const offset = hexDirections[door().direction]!;
  const outside = { q: door().q + offset.q, r: door().r + offset.r };
  if (!goTo(outside)) {
    assert.equal(goTo(door()), true);
    act("open");
    advance(turnDurationMs);
    assert.equal(goTo(outside), true);
  }
  if (door().state === "open") { act("close"); advance(turnDurationMs); }
  return { match, command, advance, snapshot, door, goTo, act, outside };
}

test("held door actions require proximity and released tokens, cancel early and freeze with pause", () => {
  const { match, command, advance, snapshot, door, act } = doorFixture(3, 2000);
  const initial = snapshot();
  assert.deepEqual(initial.doorActions.filter((option) => option.slot === 0).map(({ action }) => action), ["open"]);
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 0, target: { q: door().q + 20, r: door().r, direction: door().direction }, action: "open",
  }).ok, false);
  command({ type: "press", slot: 0 });
  const { q, r, direction } = door();
  assert.deepEqual(match.command("tablet", { type: "door-action", slot: 0, target: { q, r, direction }, action: "open" }),
    { ok: false, error: "Não é possível executar ação enquanto em movimento." });
  command({ type: "release", slot: 0 });
  act("open");
  assert.equal(match.command("tablet", { type: "press", slot: 0 }).ok, false);
  command({ type: "press", slot: 1 });
  command({ type: "release", slot: 1 });
  advance(1000);
  assert.equal(door().state, "closed");
  command({ type: "cancel-door-action", slot: 0, target: { q, r, direction }, action: "close" });
  assert.equal(snapshot().activeDoorActions.length, 1);
  command({ type: "cancel-door-action", slot: 0, target: { q, r, direction }, action: "open" });
  advance(4000);
  assert.equal(door().state, "closed");
  act("open");
  advance(1000);
  const started = snapshot().activeDoorActions[0]!.startedTurn;
  command({ type: "pause", slot: 1 });
  advance(10000);
  assert.equal(door().state, "closed");
  assert.equal(snapshot().activeDoorActions[0]!.startedTurn, started);
  command({ type: "resume", slot: 0, value: true });
  command({ type: "resume", slot: 1, value: true });
  advance(10000);
  advance(999);
  assert.equal(door().state, "closed");
  advance(1);
  assert.equal(door().state, "open");
  assert.equal(snapshot().activeDoorActions.length, 0);
  assert.deepEqual(snapshot().players[0]!.position, initial.players[0]!.position);
});

test("locking and unlocking are inside-only; breaking requires strength 3 and stays permanently open", () => {
  const { match, command, advance, snapshot, door, act, goTo, outside } = doorFixture();
  const invalid = (action: DoorAction) => {
    const { q, r, direction } = door();
    assert.equal(match.command("tablet", { type: "door-action", slot: 0, target: { q, r, direction }, action }).ok, false);
  };
  invalid("lock");
  invalid("break");
  act("open");
  advance(1000);
  assert.equal(goTo(outside, 1), true);
  assert.equal(goTo(door()), true);
  act("close");
  advance(1000);
  assert.deepEqual(snapshot().doorActions.filter(({ slot }) => slot === 0).map(({ action }) => action), ["open", "lock"]);
  act("lock");
  advance(1000);
  assert.equal(door().state, "locked");
  assert.equal(goTo(outside), false);
  assert.deepEqual(snapshot().doorActions.filter(({ slot }) => slot === 0).map(({ action }) => action), ["unlock", "break"]);
  act("unlock");
  advance(1000);
  assert.equal(door().state, "closed");
  act("lock");
  advance(1000);
  act("break", 1);
  advance(1999);
  assert.equal(door().state, "locked");
  advance(1);
  assert.equal(door().state, "broken");
  assert.equal(goTo(outside), true);
  invalid("close");
  invalid("lock");
  invalid("open");
  command({ type: "press", slot: 0 });
  command({ type: "release", slot: 0 });
});

test("door reservations, strength, ownership and disconnect cleanup are enforced by the server", () => {
  const { match, command, advance, snapshot, door, act, goTo, outside } = doorFixture(1);
  if (!goTo(outside, 1)) {
    act("open");
    advance(1000);
    assert.equal(goTo(outside, 1), true);
    act("close");
    advance(1000);
  }
  act("open");
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 1, target: { q: door().q, r: door().r, direction: door().direction }, action: "open",
  }).ok, false);
  match.connect("spectator");
  assert.deepEqual(match.snapshot("spectator").doorActions, []);
  assert.deepEqual(match.snapshot("spectator").activeDoorActions, []);
  const { q, r, direction } = door();
  assert.equal(match.command("spectator", { type: "cancel-door-action", slot: 0, target: { q, r, direction }, action: "open" }).ok, false);
  advance(1000);
  assert.equal(goTo(door()), true);
  act("close");
  advance(1000);
  act("lock");
  advance(1000);
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 0, target: { q: door().q, r: door().r, direction: door().direction }, action: "break",
  }).ok, false);
  assert.deepEqual(snapshot().doorActions.filter(({ slot }) => slot === 1).map(({ action }) => action), ["break"]);
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 1, target: { q: door().q, r: door().r, direction: door().direction }, action: "unlock",
  }).ok, false);
  act("unlock");
  advance(500);
  match.disconnect("tablet");
  assert.equal(snapshot().activeDoorActions.length, 0);
  advance(5000);
  assert.equal(door().state, "locked");
  assert.equal(snapshot().phase, "paused");
  match.connect("tablet");
  command({ type: "cancel-door-action", slot: 0, target: { q, r, direction }, action: "unlock" });
  command({ type: "resume", slot: 0, value: true });
  command({ type: "resume", slot: 1, value: true });
  advance(10000);
  act("unlock");
  command({ type: "leave", slot: 0 });
  advance(1000);
  assert.equal(door().state, "locked");
  assert.equal(snapshot().activeDoorActions.length, 0);
});

function windowFixture(dexterity = 2) {
  const game = doorFixture(1, 2000, dexterity, "window-1");
  game.act("open");
  game.advance(2000);
  assert.equal(game.goTo(game.door()), true);
  const cells = game.snapshot().exploredTerrainCells;
  const windows = cells.flatMap((cell) => cell.gates.flatMap((gate) => {
    if (gate.kind !== "window") return [];
    const offset = hexDirections[gate.direction]!;
    const outside = cells.find((other) => other.q === cell.q + offset.q && other.r === cell.r + offset.r);
    return [{ target: { q: cell.q, r: cell.r, direction: gate.direction }, outside }];
  }));
  const connected = windows.find(({ outside }) => outside && outside.terrainType !== "wall");
  const outward = windows.find(({ outside }) => !outside);
  assert.ok(connected?.outside);
  assert.ok(outward);
  const jump = () => game.command({ type: "door-action", slot: 0, target: connected.target, action: "jump-window" });
  const location = () => {
    const state = game.snapshot();
    return axialFromPoint(state.players[0]!.position, state.arena.width, state.arena.height,
      state.arena.scale, state.arena.hexSideTokenRatio);
  };
  return { ...game, connected, outward, jump, location };
}

test("window jumps require dexterity 2 and a valid destination, not merely knowledge of the window", () => {
  for (const dexterity of [1, 2, 3]) {
    const game = windowFixture(dexterity);
    const { connected, outward, snapshot, match, command, goTo } = game;
    assert.equal(goTo(connected.target), true);
    const options = snapshot().doorActions.filter(({ slot, action }) => slot === 0 && action === "jump-window");
    assert.equal(options.some(({ q, r, direction }) =>
      q === connected.target.q && r === connected.target.r && direction === connected.target.direction), true);
    if (dexterity === 1) {
      assert.deepEqual(match.command("tablet", {
        type: "door-action", slot: 0, target: connected.target, action: "jump-window",
      }), { ok: false, error: "Pular a janela exige destreza 2." });
      game.advance(2000);
      assert.deepEqual(game.location(), { q: connected.target.q, r: connected.target.r });
    } else {
      game.jump();
      game.advance(2000);
      assert.deepEqual(game.location(), { q: connected.outside!.q, r: connected.outside!.r });
      assert.ok(snapshot().doorActions.some(({ action, slot, q, r }) =>
        slot === 0 && action === "jump-window" && q === connected.target.q && r === connected.target.r));
      game.jump();
      game.advance(2000);
      assert.deepEqual(game.location(), { q: connected.target.q, r: connected.target.r });
    }
    assert.equal(goTo(outward.target), true);
    const outwardOption = snapshot().doorActions.find(({ action, slot, q, r, direction }) =>
      slot === 0 && action === "jump-window" && q === outward.target.q
      && r === outward.target.r && direction === outward.target.direction);
    assert.equal(outwardOption?.available, false);
    const position = snapshot().players[0]!.position;
    assert.equal(match.command("tablet", {
      type: "door-action", slot: 0, target: outward.target, action: "jump-window",
    }).ok, false);
    game.advance(4000);
    assert.deepEqual(snapshot().players[0]!.position, position);
    assert.equal(goTo({ q: 0, r: 0 }), true);
    const farAway = { ...connected.target, q: 100 };
    assert.equal(match.command("tablet", {
      type: "door-action", slot: 0, target: farAway, action: "jump-window",
    }).ok, false);
    command({ type: "cancel-door-action", slot: 0, target: connected.target, action: "jump-window" });
  }
});

test("window holds freeze on pause, cancel without moving and cannot be bypassed by dragging", () => {
  const game = windowFixture();
  const { connected, goTo, command, advance, snapshot, match, location, jump } = game;
  assert.equal(goTo(connected.target), true);
  const start = snapshot().players[0]!.position;
  command({ type: "press", slot: 0 });
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 0, target: connected.target, action: "jump-window",
  }).ok, false);
  advance(250);
  const d = cellDimensions(1);
  command({ type: "move", slot: 0, position: {
    x: 500 + d.width * (connected.outside!.q + connected.outside!.r / 2),
    y: 400 + d.radius * 1.5 * connected.outside!.r,
  } });
  command({ type: "release", slot: 0 });
  assert.deepEqual(location(), { q: connected.target.q, r: connected.target.r });
  assert.equal(goTo(connected.target), true);
  jump();
  advance(1000);
  const halfway = snapshot().players[0]!.position;
  command({ type: "cancel-door-action", slot: 0, target: connected.target, action: "jump-window" });
  advance(4000);
  assert.deepEqual(snapshot().players[0]!.position, halfway);
  jump();
  advance(1000);
  command({ type: "pause", slot: 1 });
  advance(5000);
  assert.deepEqual(snapshot().players[0]!.position, halfway);
  command({ type: "resume", slot: 0, value: true });
  command({ type: "resume", slot: 1, value: true });
  advance(10000);
  assert.equal(match.command("tablet", { type: "press", slot: 0 }).ok, false);
  advance(999);
  assert.deepEqual(snapshot().players[0]!.position, halfway);
  advance(1);
  assert.deepEqual(location(), { q: connected.outside!.q, r: connected.outside!.r });
  assert.notDeepEqual(snapshot().players[0]!.position, start);
  assert.equal(snapshot().activeDoorActions.length, 0);
  assert.equal(goTo(connected.target, 1), true);
  command({ type: "door-action", slot: 1, target: connected.target, action: "jump-window" });
  assert.equal(match.command("tablet", {
    type: "door-action", slot: 0, target: connected.target, action: "jump-window",
  }).ok, false);
  match.disconnect("tablet");
  assert.equal(snapshot().activeDoorActions.length, 0);
});

test("readiness starts exactly ten seconds, cancels globally and restarts from ten", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
  command({ type: "ready", slot: 0, value: true });
  assert.equal(match.snapshot().phase, "lobby");
  command({ type: "ready", slot: 1, value: true });
  assert.equal(match.snapshot().remainingMs, 10000);
  assert.equal(match.snapshot().exploredTerrainCells.length, 0);
  advance(3000);
  assert.equal(match.snapshot().remainingMs, 7000);
  command({ type: "ready", slot: 0, value: false });
  assert.equal(match.snapshot().phase, "lobby");
  assert.equal(match.snapshot().remainingMs, 0);
  assert.equal(match.snapshot().players[1]?.ready, true);
  advance(20000);
  command({ type: "ready", slot: 0, value: true });
  assert.equal(match.snapshot().remainingMs, 10000);
  assert.equal(match.snapshot().exploredTerrainCells.length, 0);
  advance(9999);
  assert.equal(match.snapshot().phase, "countdown");
  advance(1);
  assert.equal(match.snapshot().phase, "chapter");
  assert.equal(match.snapshot().simulationTurns, 0);
  const layout = terrainLayout(1920, 1200, 1);
  const positions = match.snapshot().players.map((p) => p.position);
  assert.notDeepEqual(positions[0], positions[1]);
  assert.ok(match.snapshot().exploredTerrainCells.length > 0);
  assert.ok(match.snapshot().visibleTerrainCellKeys.length > 0);
  advance(2000);
  assert.equal(match.snapshot().phase, "running");
  command({ type: "press", slot: 0 });
  const beforeMove = match.snapshot().players[0]!.position;
  advance(1000);
  command({ type: "move", slot: 0, position: { x: -500, y: 90000 } });
  command({ type: "release", slot: 0 });
  const afterMove = match.snapshot().players[0]!.position;
  assert.ok(Math.hypot(afterMove.x - beforeMove.x, afterMove.y - beforeMove.y) <= layout.width * 0.1375 + 0.01);
  assert.ok(afterMove.x >= layout.area.x && afterMove.x <= layout.area.x + layout.area.width);
  assert.ok(afterMove.y >= layout.area.y && afterMove.y <= layout.area.y + layout.area.height);
});

test("a screen too small for every player rejects readiness without starting", () => {
  const { match, command } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "viewport", width: 320, height: 320 });
  for (let index = 0; index < 20; index++) command({ type: "scale", slot: 0, delta: 0.05 });
  const result = match.command("tablet", { type: "ready", slot: 0, value: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /mapa modular não comporta/i);
  assert.equal(match.snapshot().phase, "lobby");
  assert.equal(match.snapshot().players[0]?.ready, false);
  assert.equal(match.snapshot().exploredTerrainCells.length, 0);
});

test("unused points do not prevent starting, but no configuration can change after countdown", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "ready", slot: 0, value: true });
  advance(10000);
  for (const value of [
    { type: "attribute", slot: 0, attribute: "wisdom", delta: 1 },
    { type: "scale", slot: 0, delta: 0.05 },
    { type: "join", slot: 1, name: "AAB", color: "blue" },
    { type: "viewport", width: 1000, height: 600 },
    { type: "ready", slot: 0, value: false },
  ]) assert.equal(match.command("tablet", value).ok, false);
  assert.deepEqual(match.snapshot().players[0]?.attributes, { strength: 1, dexterity: 1, wisdom: 1 });
});

test("pause freezes positions, simulation and chapter timer until every connected player resumes", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
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
  assert.equal(match.snapshot().simulationTurns, 1);
  command({ type: "pause", slot: 1 });
  advance(30000);
  assert.equal(match.snapshot().simulationTurns, 1);
  assert.equal(match.command("tablet", { type: "move", slot: 0, position: { x: 10, y: 10 } }).ok, false);
});

test("disconnect pauses only participating clients, reconnection restores ownership and requires collective resume", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
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
  const frozen = match.snapshot().simulationTurns;
  advance(20000);
  assert.equal(match.snapshot().simulationTurns, frozen);
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
  assert.equal(match.snapshot().simulationTurns, 0);
});

test("resume countdown cancels and restarts at ten without advancing the paused world", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
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
  assert.equal(match.snapshot().simulationTurns, frozen.simulationTurns);
  assert.deepEqual(match.snapshot().players.map((p) => p.position), frozen.players.map((p) => p.position));
  assert.equal(match.command("tablet", { type: "press", slot: 0 }).ok, false);
  advance(1);
  assert.equal(match.snapshot().phase, "running");
  assert.equal(match.snapshot().simulationTurns, frozen.simulationTurns);
  assert.ok(match.snapshot().players.every((p) => !p.resumeReady));
  advance(100);
  assert.equal(match.snapshot().simulationTurns, frozen.simulationTurns + 0.1);
});

test("disconnect and confirmed exit cancel an in-progress resume countdown", () => {
  const { match, command, advance } = fixture();
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
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
  command({ type: "join", slot: 0, name: "AAA", color: "red" });
  command({ type: "join", slot: 1, name: "AAB", color: "blue" });
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
  assert.equal(match.command("tablet", { type: "join", slot: 2, name: "AAA", color: "green" }).ok, false);
  assert.equal(match.command("tablet", { type: "join", slot: 8, name: "ZZZ", color: "green" }).ok, false);
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
  const config = readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
  });
  assert.equal(config.PORT, 3000);
  assert.equal(config.PLAYER_VISION_RADIUS_CELLS, 3);
  assert.equal(config.HEX_SIDE_TOKEN_RATIO, 1.2);
  assert.equal(config.TURN_DURATION_MS, 1000);
  assert.equal(config.BASE_MOVEMENT_CELLS_PER_TURN, 0.5);
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    PLAYER_VISION_RADIUS_CELLS: "5",
  }).PLAYER_VISION_RADIUS_CELLS, 5);
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    BASE_MOVEMENT_CELLS_PER_TURN: "0.75",
  }).BASE_MOVEMENT_CELLS_PER_TURN, 0.75);
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    TURN_DURATION_MS: "2000",
  }).TURN_DURATION_MS, 2000);
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    TURN_DURATION_MS: "2000",
    BASE_MOVEMENT_CELLS_PER_SECOND: "0.75",
  }).BASE_MOVEMENT_CELLS_PER_TURN, 1.5);
  assert.equal(readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    BASE_MOVEMENT_CELLS_PER_TURN: "0.25",
    BASE_MOVEMENT_CELLS_PER_SECOND: "0.75",
  }).BASE_MOVEMENT_CELLS_PER_TURN, 0.25);
  assert.throws(() => readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    PLAYER_VISION_RADIUS_CELLS: "0",
  }), /Invalid server configuration/);
  assert.throws(() => readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    BASE_MOVEMENT_CELLS_PER_TURN: "0",
  }), /Invalid server configuration/);
  assert.throws(() => readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    TURN_DURATION_MS: "99",
  }), /Invalid server configuration/);
});

test("the public catalog excludes monster attributes and capabilities", () => {
  const publicCatalog = new Match(catalog).publicCatalog();
  assert.deepEqual(publicCatalog.monsters, [{ id: "test", name: "Test" }]);
  assert.equal("attributes" in publicCatalog.monsters[0]!, false);
  assert.equal("capabilities" in publicCatalog.monsters[0]!, false);
});

test("vision radius is validated and included in snapshots", () => {
  const config = readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    PLAYER_VISION_RADIUS_CELLS: "5",
  });
  assert.equal(new Match(catalog, undefined, config.PLAYER_VISION_RADIUS_CELLS).snapshot().visionRadiusCells, 5);
  assert.throws(() => new Match(catalog, undefined, 0));
});

test("configured movement speed is validated and included in snapshots", () => {
  const config = readConfig({
    POSTGRES_PASSWORD: "b".repeat(32),
    BASE_MOVEMENT_CELLS_PER_TURN: "0.75",
    TURN_DURATION_MS: "2000",
  });
  const snapshot = new Match(
    catalog, undefined, 3,
    config.BASE_MOVEMENT_CELLS_PER_TURN,
    config.TURN_DURATION_MS,
  ).snapshot();
  assert.equal(snapshot.baseMovementCellsPerTurn, 0.75);
  assert.equal(snapshot.turnDurationMs, 2000);
  assert.throws(() => new Match(catalog, undefined, 3, 0));
});

test("hex side ratio is validated and shared in the arena snapshot", () => {
  const config = readConfig({ POSTGRES_PASSWORD: "b".repeat(32), HEX_SIDE_TOKEN_RATIO: "1.5" });
  const match = new Match(catalog, undefined, 3, 0.5, 1000, config.HEX_SIDE_TOKEN_RATIO);
  assert.equal(match.snapshot().arena.hexSideTokenRatio, 1.5);
  for (const ratio of ["0", "1.19", "Infinity", "invalid"]) {
    assert.throws(() => readConfig({
      POSTGRES_PASSWORD: "b".repeat(32), HEX_SIDE_TOKEN_RATIO: ratio,
    }), /Invalid server configuration/);
  }
  assert.throws(() => new Match(catalog, undefined, 3, 0.5, 1000, 1.19));
});

test("movement is measured using the configured turn duration", () => {
  const movementAfter = (turnDurationMs: number, ratio = 1.2) => {
    let time = 0;
    const match = new Match(catalog, () => time, 3, 1, turnDurationMs, ratio);
    match.connect("tablet");
    const command = (value: MatchCommand) => assert.deepEqual(
      match.command("tablet", value),
      { ok: true },
    );
    command({ type: "join", slot: 0, name: "AAA", color: "red" });
    command({ type: "ready", slot: 0, value: true });
    time += 10000;
    match.tick();
    time += 2000;
    match.tick();
    command({ type: "press", slot: 0 });
    time += 100;
    const before = match.snapshot().players[0]!.position;
    command({ type: "move", slot: 0, position: { x: before.x + 40, y: before.y } });
    const after = match.snapshot().players[0]!.position;
    return Math.hypot(after.x - before.x, after.y - before.y);
  };
  assert.ok(Math.abs(movementAfter(1000) - cellDimensions(1).width * 0.1) < 0.01);
  assert.ok(Math.abs(movementAfter(2000) - cellDimensions(1).width * 0.05) < 0.01);
  assert.ok(Math.abs(movementAfter(1000, 1.5) - cellDimensions(1, 1.5).width * 0.1) < 0.01);
});
