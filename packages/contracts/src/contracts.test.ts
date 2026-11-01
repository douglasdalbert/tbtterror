import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateAttributePoint, attributesSchema, availableAttributePoints, initialPlayerAttributes,
  matchSnapshotSchema, parseApiResponse, playerAttributesSchema, settingsSchema,
} from "./index.js";
import { boardArea, cellDimensions, hexCorners, terrainLayout } from "./layout.js";

test("attributes reject out-of-range values and unknown properties", () => {
  assert.equal(attributesSchema.safeParse({ strength: 0, dexterity: 2, intelligence: 2 }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 4, intelligence: 2 }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 2, intelligence: 2, extra: true }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 2, intelligence: 2 }).success, true);
  assert.equal(attributesSchema.safeParse({ strength: 2, speed: 2, intelligence: 2 }).success, false);
});

test("players start at one and can allocate and refund exactly three points", () => {
  const initial = initialPlayerAttributes();
  assert.deepEqual(initial, { strength: 1, dexterity: 1, intelligence: 1 });
  assert.equal(availableAttributePoints(initial), 3);
  const strength2 = allocateAttributePoint(initial, "strength", 1);
  const strength3 = allocateAttributePoint(strength2, "strength", 1);
  const allocated = allocateAttributePoint(strength3, "dexterity", 1);
  assert.deepEqual(allocated, { strength: 3, dexterity: 2, intelligence: 1 });
  assert.equal(availableAttributePoints(allocated), 0);
  assert.throws(() => allocateAttributePoint(allocated, "intelligence", 1));
  assert.throws(() => allocateAttributePoint(strength3, "strength", 1));
  assert.throws(() => allocateAttributePoint(initial, "intelligence", -1));
  assert.equal(availableAttributePoints(allocateAttributePoint(allocated, "strength", -1)), 1);
  assert.equal(availableAttributePoints({ strength: 2, dexterity: 2, intelligence: 2 }), 0);
  assert.equal(playerAttributesSchema.safeParse({ strength: 3, dexterity: 3, intelligence: 3 }).success, false);
  assert.deepEqual(initial, initialPlayerAttributes());
});

test("settings enforce the agreed geometry and touch requirements", () => {
  const settings = {
    maxPlayers: 8,
    minimumTouchPoints: 10,
    countdownSeconds: 10,
    moduleCells: 7,
    rotationStepDegrees: 60,
  };
  assert.equal(settingsSchema.safeParse(settings).success, true);
  assert.equal(settingsSchema.safeParse({ ...settings, rotationStepDegrees: 90 }).success, false);
});

test("lobby snapshots cannot accidentally include hidden world data", () => {
  const snapshot = {
    id: "8312cb65-50ae-4fb6-879c-071b1861bd22",
    phase: "lobby",
    catalogRevision: 1,
  };
  assert.equal(matchSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, monsterPosition: [1, 2] }).success, false);
});

test("HTTP parsing surfaces server errors and rejects invalid successful responses", async () => {
  await assert.rejects(parseApiResponse(new Response(JSON.stringify({ error: "Acesso negado." }), {
    status: 401, headers: { "Content-Type": "application/json" },
  }), settingsSchema), /Acesso negado/);
  await assert.rejects(parseApiResponse(new Response("{}"), settingsSchema), /incompatíveis/);
});

test("token and clearance scale proportionally inside the hexagon's incircle", () => {
  for (const scale of [0.5, 1, 1.5, 2]) {
    const dimensions = cellDimensions(scale);
    assert.equal(dimensions.tokenDiameter, 64 * scale);
    assert.equal(dimensions.clearance, 8 * scale);
    assert.equal(dimensions.width, 80 * scale);
    assert.ok(Math.abs(dimensions.radius * Math.sqrt(3) / 2
      - dimensions.tokenDiameter / 2 - dimensions.clearance) < 1e-7);
  }
  assert.throws(() => cellDimensions(0));
  assert.throws(() => cellDimensions(Infinity));
});

test("whole seven-cell terrains fit the usable area without overlap or clipping", () => {
  for (const [width, height] of [[1920, 1200], [1200, 1920], [800, 600], [320, 240]] as const) {
    for (const scale of [0.5, 1, 1.5, 2]) {
      const layout = terrainLayout(width, height, scale);
      const occupied = new Set<string>();
      for (const terrain of layout.placements) {
        assert.equal(terrain.cells.length, 7);
        for (const cell of terrain.cells) {
          const key = `${cell.q},${cell.r}`;
          assert.equal(occupied.has(key), false);
          occupied.add(key);
          for (const point of hexCorners(cell, layout.radius)) {
            assert.ok(point.x >= layout.area.x - 1e-7);
            assert.ok(point.y >= layout.area.y - 1e-7);
            assert.ok(point.x <= layout.area.x + layout.area.width + 1e-7);
            assert.ok(point.y <= layout.area.y + layout.area.height + 1e-7);
          }
        }
      }
    }
  }
});

test("the playable area reserves all eight player sectors at each viewport size", () => {
  const area = boardArea(1920, 1200);
  assert.deepEqual(area, { x: 152, y: 152, width: 1616, height: 896 });
  assert.deepEqual(boardArea(800, 600), { x: 144, y: 152, width: 512, height: 296 });
  assert.deepEqual(boardArea(100, 100), { x: 18, y: 30, width: 64, height: 40 });
  assert.deepEqual(boardArea(1920, 1200, 2), { x: 184, y: 184, width: 1552, height: 832 });
  assert.deepEqual(boardArea(0, 0), { x: 0, y: 0, width: 0, height: 0 });
  assert.throws(() => boardArea(Infinity, 100));
});

test("larger tokens reduce capacity and undersized screens fit no complete terrain", () => {
  const normal = terrainLayout(1920, 1200, 1);
  assert.ok(normal.placements.length > 1);
  assert.ok(terrainLayout(1920, 1200, 2).placements.length < normal.placements.length);
  assert.equal(terrainLayout(100, 100, 1).placements.length, 0);
  assert.equal(terrainLayout(0, 0, 1).placements.length, 0);
});
