import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateAttributePoint, attributesSchema, availableAttributePoints, initialPlayerAttributes,
  PLAYER_COLORS, PLAYER_COLOR_IDS, playerColorSchema,
  generateTerrainMap, generatedTerrainMapSchema, STARTER_TERRAIN_MODULES, terrainMapCells,
  movementMultiplier, moveWithinTerrain, visibleTerrainCellIndices,
  matchSnapshotSchema, parseApiResponse, playerAttributesSchema, settingsSchema,
  enterPreparationPlayer, leavePreparationPlayer, changePreparationAttribute, rotatePlayerName, type PreparationState,
  rotateTerrainModule, terrainModuleCatalogSchema, terrainModuleSchema, terrainModulesConnect, type TerrainModule,
} from "./index.js";
import { boardArea, cellDimensions, hexCorners, terrainLayout, tokenHitCircle } from "./layout.js";
import { hexDirections } from "./terrain.js";

function terrainModule(): TerrainModule {
  return {
    id: "starter",
    name: "Clareira",
    cells: [{ q: 0, r: 0 }, ...hexDirections].map(({ q, r }) => ({
      q,
      r,
      terrainType: "path",
      traversable: true,
      actions: q === 0 && r === 0 ? ["inspect"] : [],
      objectSlots: q === 1 && r === 0 ? ["item"] : [],
      connectors: Array(6).fill("path"),
    })),
  };
}

test("attributes reject out-of-range values and unknown properties", () => {
  assert.equal(attributesSchema.safeParse({ strength: 0, dexterity: 2, wisdom: 2 }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 4, wisdom: 2 }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 2, wisdom: 2, extra: true }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 2, wisdom: 2 }).success, true);
  assert.equal(attributesSchema.safeParse({ strength: 2, speed: 2, intelligence: 2 }).success, false);
  assert.equal(attributesSchema.safeParse({ strength: 2, dexterity: 2, intelligence: 2 }).success, false);
});

test("players start at one and can allocate and refund exactly three points", () => {
  const initial = initialPlayerAttributes();
  assert.deepEqual(initial, { strength: 1, dexterity: 1, wisdom: 1 });
  assert.equal(availableAttributePoints(initial), 3);
  const strength2 = allocateAttributePoint(initial, "strength", 1);
  const strength3 = allocateAttributePoint(strength2, "strength", 1);
  const allocated = allocateAttributePoint(strength3, "dexterity", 1);
  assert.deepEqual(allocated, { strength: 3, dexterity: 2, wisdom: 1 });
  assert.equal(availableAttributePoints(allocated), 0);
  assert.throws(() => allocateAttributePoint(allocated, "wisdom", 1));
  assert.throws(() => allocateAttributePoint(strength3, "strength", 1));
  assert.throws(() => allocateAttributePoint(initial, "wisdom", -1));
  assert.equal(availableAttributePoints(allocateAttributePoint(allocated, "strength", -1)), 1);
  assert.equal(availableAttributePoints({ strength: 2, dexterity: 2, wisdom: 2 }), 0);
  assert.equal(playerAttributesSchema.safeParse({ strength: 3, dexterity: 3, wisdom: 3 }).success, false);
  assert.deepEqual(initial, initialPlayerAttributes());
});

test("three-letter names rotate, wrap and reject invalid inputs", () => {
  assert.equal(rotatePlayerName("AAA", 0, -1), "ZAA");
  assert.equal(rotatePlayerName("AZA", 1, 1), "AAA");
  assert.equal(rotatePlayerName(rotatePlayerName("AAA", 0, 1), 1, 1), "BBA");
  assert.throws(() => rotatePlayerName("aa", 0, 1));
  assert.throws(() => rotatePlayerName("AAA", 3, 1));
});

test("token colors provide the thirteen requested distinct, high-contrast choices", () => {
  assert.equal(PLAYER_COLORS.length, 13);
  assert.equal(new Set(PLAYER_COLORS.map(({ id }) => id)).size, PLAYER_COLORS.length);
  assert.deepEqual(PLAYER_COLORS.map(({ id }) => id), PLAYER_COLOR_IDS);
  assert.deepEqual(PLAYER_COLORS.map(({ label }) => label), [
    "Vermelho", "Azul", "Verde", "Amarelo", "Roxo", "Rosa", "Preto",
    "Cinza", "Branco", "Laranja", "Marrom", "Verde escuro", "Azul escuro",
  ]);
  const rgb = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (hex: string) => {
    const linear = rgb(hex).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  for (const { id, hex, text } of PLAYER_COLORS) {
    assert.equal(playerColorSchema.safeParse(id).success, true);
    assert.match(hex, /^#[0-9a-f]{6}$/);
    const contrast = (Math.max(luminance(hex), luminance(text)) + 0.05)
      / (Math.min(luminance(hex), luminance(text)) + 0.05);
    assert.ok(contrast >= 4.5, `${id} needs readable token text; contrast is ${contrast}.`);
  }
  for (let first = 0; first < PLAYER_COLORS.length; first++) {
    for (let second = first + 1; second < PLAYER_COLORS.length; second++) {
      const a = rgb(PLAYER_COLORS[first]!.hex);
      const b = rgb(PLAYER_COLORS[second]!.hex);
      const distance = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      assert.ok(distance >= 45, `${PLAYER_COLORS[first]!.id} and ${PLAYER_COLORS[second]!.id} are too similar.`);
    }
  }
  assert.equal(playerColorSchema.safeParse("not-a-color").success, false);
});

test("joining is atomic, rejects duplicate names or colors and frees both on confirmed exit", () => {
  const empty: PreparationState = { players: {}, errors: {} };
  const joined = enterPreparationPlayer(empty, 0, "AAA", "red");
  const duplicate = enterPreparationPlayer(joined, 1, "AAA", "blue");
  assert.equal(duplicate.players[1], undefined);
  assert.match(duplicate.errors[1] ?? "", /já está em uso/);
  const duplicateColor = enterPreparationPlayer(joined, 1, "AAB", "red");
  assert.equal(duplicateColor.players[1], undefined);
  assert.match(duplicateColor.errors[1] ?? "", /cor escolhida já está em uso/);
  assert.equal(enterPreparationPlayer(joined, 0, "BBB", "blue").players[0]?.name, "AAA");
  const retried = enterPreparationPlayer(duplicate, 1, "AAB", "blue");
  assert.equal(retried.errors[1], "");
  assert.equal(retried.players[1]?.name, "AAB");
  const changed = changePreparationAttribute(retried, 1, "wisdom", 1);
  assert.equal(changed.players[1]?.attributes.wisdom, 2);
  assert.equal(changed.players[0]?.attributes.wisdom, 1);
  const invalid = changePreparationAttribute(changed, 1, "strength", -1);
  assert.match(invalid.errors[1] ?? "", /Respeite/);
  assert.equal(invalid.players, changed.players);
  const left = leavePreparationPlayer(changed, 0);
  assert.equal(enterPreparationPlayer(left, 2, "AAA", "red").players[2]?.name, "AAA");
  assert.match(enterPreparationPlayer(empty, 0, "AA1", "red").errors[0] ?? "", /três letras/);
  assert.throws(() => enterPreparationPlayer(empty, 8, "AAA", "red"));
  assert.deepEqual(empty, { players: {}, errors: {} });
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

test("terrain modules validate seven unique cells, separate capabilities and connected paths", () => {
  const module = terrainModule();
  assert.equal(terrainModuleSchema.safeParse(module).success, true);
  assert.equal(terrainModuleCatalogSchema.safeParse([module]).success, true);
  assert.equal(terrainModuleCatalogSchema.safeParse([module, module]).success, false);
  assert.equal(terrainModuleCatalogSchema.safeParse([{
    ...module,
    cells: module.cells.map((cell) => ({ ...cell, actions: [], objectSlots: [] })),
  }]).success, false);
  assert.equal(terrainModuleSchema.safeParse({
    ...module,
    cells: module.cells.slice(1),
  }).success, false);
  assert.equal(terrainModuleSchema.safeParse({
    ...module,
    cells: module.cells.map((cell) => ({ ...cell, terrainType: "ground" })),
  }).success, false);
  assert.equal(terrainModuleSchema.safeParse({
    ...module,
    cells: module.cells.map((cell) => cell.q === 1 && cell.r === 0
      ? { ...cell, connectors: [...cell.connectors.slice(0, 3), null, ...cell.connectors.slice(4)] }
      : cell),
  }).success, false);
  assert.equal(terrainModuleSchema.safeParse({
    ...module,
    cells: module.cells.map((cell) => cell.q === 0 && cell.r === 0
      ? { ...cell, traversable: false }
      : cell),
  }).success, false);
});

test("terrain module rotations preserve cell capabilities and rotate connectors in sixty-degree steps", () => {
  const module = terrainModule();
  const rotated = Array.from({ length: 6 }, (_, steps) => rotateTerrainModule(module, steps));
  assert.deepEqual(rotated[0], module);
  for (const [steps, result] of rotated.entries()) {
    assert.equal(result.cells.length, 7);
    assert.equal(result.cells.find((cell) => cell.actions.length > 0)?.terrainType, "path");
    const center = result.cells.find((cell) => cell.q === 0 && cell.r === 0);
    assert.deepEqual(center?.connectors, Array(6).fill("path"));
    if (steps > 0) {
      const objectCell = result.cells.find((cell) => cell.objectSlots.length > 0);
      assert.notDeepEqual({ q: objectCell?.q, r: objectCell?.r }, { q: 1, r: 0 });
    }
  }
  assert.deepEqual(rotateTerrainModule(rotated[1]!, 5), module);
  assert.throws(() => rotateTerrainModule(module, 6));
});

test("terrain modules only connect through matching reciprocal boundary connectors", () => {
  const module = terrainModule();
  assert.equal(terrainModulesConnect(module, module, { q: 2, r: 1 }), true);
  const incompatible = {
    ...module,
    cells: module.cells.map((cell) => ({
      ...cell,
      connectors: Array(6).fill("wall"),
    })),
  };
  assert.equal(terrainModulesConnect(module, incompatible, { q: 2, r: 1 }), false);
  const partiallyMismatched = terrainModuleSchema.parse({
    ...module,
    id: "partial",
    cells: module.cells.map((cell) => ({
      ...cell,
      connectors: cell.q === 0 && cell.r === -1
        ? ["wall", "wall", "wall", "path", "wall", "wall"]
        : Array(6).fill("wall"),
    })),
  });
  assert.equal(terrainModulesConnect(module, partiallyMismatched, { q: 2, r: 1 }), false);
  assert.equal(terrainModulesConnect(module, module, { q: 0, r: 0 }), false);
});

test("seeded terrain generation fits whole connected modules and expands to unique cells", () => {
  const first = generateTerrainMap(1920, 1200, 1, "map-seed");
  const repeated = generateTerrainMap(1920, 1200, 1, "map-seed");
  const other = generateTerrainMap(1920, 1200, 1, "different-seed");
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, other);
  assert.equal(first.modules[0]?.id, "clearing");
  assert.ok(first.modules.length > 1);
  assert.equal(generatedTerrainMapSchema.safeParse(first).success, true);
  assert.equal(new Set(first.modules.map(({ rotation }) => rotation)).size > 1, true);
  assert.equal(new Set(first.modules.map(({ id }) => id)).size > 1, true);
  const cells = terrainMapCells(first);
  assert.equal(cells.length, first.modules.length * 7);
  assert.equal(new Set(cells.map(({ q, r }) => `${q},${r}`)).size, cells.length);
  assert.ok(cells.filter(({ traversable }) => traversable).length >= first.modules.length * 6);
  assert.equal(terrainMapCells(generateTerrainMap(320, 320, 2, "too-small")).length, 0);
  assert.ok(
    generateTerrainMap(1920, 1200, 2, "map-seed").modules.length < first.modules.length,
  );
  const maximumArena = generateTerrainMap(7680, 7680, 0.5, "maximum-arena");
  assert.ok(maximumArena.modules.length > 0);
  assert.ok(maximumArena.modules.length <= 8000);
  assert.equal(STARTER_TERRAIN_MODULES.length, 4);
  assert.equal(generatedTerrainMapSchema.safeParse({
    seed: "overlap",
    modules: [
      { id: "clearing", q: 0, r: 0, rotation: 0 },
      { id: "cabin", q: 0, r: 0, rotation: 1 },
    ],
  }).success, false);
});

test("movement speed scales with dexterity and collision checks enforce terrain connectors", () => {
  assert.equal(movementMultiplier(1), 1);
  assert.equal(movementMultiplier(2), 1.1);
  assert.equal(movementMultiplier(3), 1.2);
  assert.throws(() => movementMultiplier(4));

  const module = terrainModule();
  const start = { x: 960, y: 600 };
  const target = { x: start.x + cellDimensions(1).width * 2, y: start.y };
  const bounded = moveWithinTerrain(module.cells, start, target, 10, 1920, 1200, 1);
  assert.ok(Math.hypot(bounded.x - start.x, bounded.y - start.y) <= 10.01);
  const blockedCells = module.cells.map((cell) => cell.q === 1 && cell.r === 0
    ? { ...cell, terrainType: "wall", traversable: false, connectors: Array(6).fill(null) }
    : cell);
  const blocked = moveWithinTerrain(blockedCells, start, target, 200, 1920, 1200, 1);
  assert.ok(blocked.x < start.x + cellDimensions(1).width / 2);

  const connectorBlockedCells = module.cells.map((cell) => ({
    ...cell,
    connectors: cell.q === 0 && cell.r === 0
      ? [null, "path", "path", "path", "path", "path"]
      : cell.q === 1 && cell.r === 0
        ? ["path", "path", "path", null, "path", "path"]
        : cell.connectors,
  }));
  const connectorBlocked = moveWithinTerrain(connectorBlockedCells, start, target, 200, 1920, 1200, 1);
  assert.ok(connectorBlocked.x < start.x + cellDimensions(1).width / 2);
});

test("vision includes hex cells in range and unions every player's view", () => {
  const module = terrainModule();
  const positions = [
    { x: 960, y: 600 },
    { x: 960 + cellDimensions(1).width * 2, y: 600 },
  ];
  const visible = visibleTerrainCellIndices(positions.map((position) => ({ position })), module.cells, 1920, 1200, 1, 1);
  assert.deepEqual(visible, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(visibleTerrainCellIndices([{ position: positions[0]! }], module.cells, 1920, 1200, 1, 1).length, 7);
});

test("lobby snapshots cannot accidentally include hidden world data", () => {
  const snapshot = {
    id: "8312cb65-50ae-4fb6-879c-071b1861bd22",
    phase: "lobby",
    catalogRevision: 1,
    players: [], arena: { width: 1920, height: 1200, scale: 1 },
    remainingMs: 0, resumeRemainingMs: 0, simulationMs: 0, chapter: "", error: "", controlSlots: [],
    visionRadiusCells: 3,
    exploredTerrainCells: [],
    visibleTerrainCellKeys: [],
  };
  assert.equal(matchSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, phase: "paused", resumeRemainingMs: 10000 }).success, true);
  for (const resumeRemainingMs of [-1, 10001, Infinity]) {
    assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, resumeRemainingMs }).success, false);
  }
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, monsterPosition: [1, 2] }).success, false);
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, visibleTerrainCellKeys: ["secret"] }).success, false);
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, terrainSeed: "secret" }).success, false);
  assert.equal(matchSnapshotSchema.safeParse({ ...snapshot, terrain: null }).success, false);
});

test("touch circles follow the actual token diameter through increasing and decreasing scales", () => {
  for (const scale of [1, 2, 0.5, 1.5, 2, 1]) {
    const diameter = 64 * scale;
    const circle = tokenHitCircle(diameter);
    assert.deepEqual(circle, { x: diameter / 2, y: diameter / 2, radius: diameter / 2 });
    assert.ok(Math.hypot(diameter / 2 - circle.x, diameter / 2 - circle.y) <= circle.radius);
  }
  assert.throws(() => tokenHitCircle(0));
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
  assert.deepEqual(area, { x: 96, y: 96, width: 1728, height: 1008 });
  assert.deepEqual(boardArea(800, 600), { x: 96, y: 96, width: 608, height: 408 });
  assert.deepEqual(boardArea(100, 100), { x: 18, y: 30, width: 64, height: 40 });
  for (const scale of [0.5, 1, 2]) {
    assert.deepEqual(boardArea(1920, 1200, scale), area);
    assert.equal(cellDimensions(scale).tokenDiameter, 64 * scale);
  }
  assert.ok(area.width * area.height > 1616 * 896);
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
