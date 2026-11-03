import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocateAttributePoint, attributesSchema, availableAttributePoints, initialPlayerAttributes,
  PLAYER_COLORS, PLAYER_COLOR_IDS, playerColorSchema,
  generateTerrainMap, generatedTerrainMapSchema, STARTER_TERRAIN_MODULES, terrainMapCells,
  BASE_MOVEMENT_CELLS_PER_TURN, DEFAULT_TURN_DURATION_MS, movementMultiplier,
  movementSpeedSchema, turnDurationSchema,
  BASE_TOKEN_DIAMETER, DOOR_ACTION_RULES, doorActionsForState, doorStateAfterAction, matchCommandSchema,
  moveWithinTerrain, visibleTerrainCellIndices,
  matchSnapshotSchema, parseApiResponse, playerAttributesSchema, settingsSchema,
  enterPreparationPlayer, leavePreparationPlayer, changePreparationAttribute, rotatePlayerName, type PreparationState,
  rotateTerrainModule, terrainModuleCatalogSchema, terrainModuleSchema, terrainModulesConnect,
  type TerrainModule, type TerrainModuleCell,
} from "./index.js";
import { boardArea, cellDimensions, hexCorners, terrainLayout, tokenHitCircle } from "./layout.js";
import { hexDirections } from "./terrain.js";
import { activeDoorActionSchema, doorActionOptionSchema } from "./doorActions.js";

test("tokens use 40 px and door rules distinguish states, sides and numeric action costs", () => {
  assert.equal(BASE_TOKEN_DIAMETER, 40);
  assert.equal(cellDimensions(1).side, 48);
  assert.deepEqual(doorActionsForState("closed", false), ["open"]);
  assert.deepEqual(doorActionsForState("closed", true), ["open", "lock"]);
  for (const inside of [false, true]) {
    assert.deepEqual(doorActionsForState("open", inside), ["close"]);
    assert.deepEqual(doorActionsForState("broken", inside), []);
  }
  assert.deepEqual(doorActionsForState("locked", false), ["break"]);
  assert.deepEqual(doorActionsForState("locked", true), ["unlock", "break"]);
  assert.equal(DOOR_ACTION_RULES.break.durationTurns, 2);
  assert.equal(DOOR_ACTION_RULES.break.strength, 3);
  for (const action of ["open", "close", "lock", "unlock"] as const) {
    assert.equal(DOOR_ACTION_RULES[action].durationTurns, 1);
    assert.equal(DOOR_ACTION_RULES[action].strength, 1);
  }
  assert.equal(doorStateAfterAction("break"), "broken");
  assert.equal(doorStateAfterAction("unlock"), "closed");
  assert.equal(matchCommandSchema.safeParse({
    type: "door-action", slot: 0, target: { q: 1, r: 0, direction: 6 }, action: "open",
  }).success, false);
  assert.equal(matchCommandSchema.safeParse({
    type: "door-action", slot: 0, target: { q: 1, r: 0, direction: 0 }, action: "open", durationTurns: 0,
  }).success, false);
});

test("window action contracts validate costs, availability and held commands without adding locks", () => {
  assert.equal(DOOR_ACTION_RULES["jump-window"].durationTurns, 1);
  assert.equal(DOOR_ACTION_RULES["jump-window"].dexterity, 2);
  const option = { slot: 0, q: 1, r: 0, direction: 0, action: "jump-window" };
  assert.equal(doorActionOptionSchema.parse(option).available, true);
  assert.equal(doorActionOptionSchema.parse({ ...option, available: false }).available, false);
  assert.equal(doorActionOptionSchema.safeParse({ ...option, available: "false" }).success, false);
  assert.equal(activeDoorActionSchema.parse({ ...option, startedTurn: 2 }).action, "jump-window");
  for (const type of ["door-action", "cancel-door-action"]) {
    assert.equal(matchCommandSchema.safeParse({
      type, slot: 0, target: { q: 1, r: 0, direction: 0 }, action: "jump-window",
    }).success, true);
  }
  assert.equal(matchCommandSchema.safeParse({
    type: "door-action", slot: 0, target: { q: 1, r: 0, direction: 0 }, action: "lock-window",
  }).success, false);
});

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
      gates: Array(6).fill(null),
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
  }).success, true);
  assert.equal(terrainModuleSchema.safeParse({
    ...module,
    cells: module.cells.map((cell) => ({ ...cell, terrainType: "Invalid Type" })),
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

test("the house validates one item away from passages and zero to three windows never touching its door", () => {
  const house = STARTER_TERRAIN_MODULES.find(({ id }) => id === "abandoned-house");
  assert.ok(house);
  assert.equal(terrainModuleSchema.safeParse(house).success, true);
  assert.equal(house.cells.filter(({ objectSlots }) => objectSlots.includes("lost-item")).length, 1);
  assert.ok(house.cells.filter(({ objectSlots }) => objectSlots.includes("lost-item"))
    .every(({ gates }) => !gates.includes("door") && !gates.includes("window")));
  assert.deepEqual(
    ["door", "window", "wall"].map((kind) =>
      house.cells.flatMap(({ gates }) => gates).filter((gate) => gate === kind).length),
    [1, 1, 16],
  );
  const doorCell = house.cells.find(({ gates }) => gates.includes("door"));
  const windowCell = house.cells.find(({ gates }) => gates.includes("window"));
  assert.ok(doorCell);
  assert.ok(windowCell);
  assert.notDeepEqual(
    { q: doorCell.q, r: doorCell.r },
    { q: 0, r: 0 },
  );
  assert.notDeepEqual(
    { q: windowCell.q, r: windowCell.r },
    { q: 0, r: 0 },
  );
  for (let steps = 0; steps < 6; steps++) {
    const rotated = rotateTerrainModule(house, steps);
    const rotatedDoor = rotated.cells.find(({ gates }) => gates.includes("door"));
    const rotatedWindow = rotated.cells.find(({ gates }) => gates.includes("window"));
    let expectedQ: number = doorCell.q;
    let expectedR: number = doorCell.r;
    for (let turn = 0; turn < steps; turn++) {
      const nextQ = -expectedR;
      const nextR = expectedQ + expectedR;
      expectedQ = nextQ === 0 ? 0 : nextQ;
      expectedR = nextR === 0 ? 0 : nextR;
    }
    assert.deepEqual({ q: rotatedDoor?.q, r: rotatedDoor?.r }, { q: expectedQ, r: expectedR });
    assert.equal(rotatedDoor?.gates.indexOf("door"), steps);
    assert.equal(rotatedWindow?.gates.indexOf("window"), (3 + steps) % 6);
  }
  const missingWall = {
    ...house,
    cells: house.cells.map((cell) => {
      const direction = cell.gates.indexOf("wall");
      return direction < 0
        ? cell
        : { ...cell, gates: cell.gates.map((gate, index) => index === direction ? null : gate) };
    }),
  };
  assert.equal(terrainModuleSchema.safeParse(missingWall).success, false);
  for (const cell of house.cells.filter(({ gates }) => !gates.includes("door") && !gates.includes("window"))) {
    assert.equal(terrainModuleSchema.safeParse({
      ...house,
      cells: house.cells.map((candidate) => ({
        ...candidate, objectSlots: candidate === cell ? ["lost-item"] : [],
      })),
    }).success, true);
  }
  for (const cell of [doorCell, windowCell]) {
    assert.equal(terrainModuleSchema.safeParse({
      ...house,
      cells: house.cells.map((candidate) => ({
        ...candidate, objectSlots: candidate === cell ? ["lost-item"] : [],
      })),
    }).success, false);
  }
  const withoutWindows = {
    ...house,
    cells: house.cells.map((cell) => ({
      ...cell, gates: cell.gates.map((gate) => gate === "window" ? "wall" : gate),
    })),
  };
  assert.equal(terrainModuleSchema.safeParse(withoutWindows).success, true);
  for (const direction of [1, 5]) {
    const touchingDoor = {
      ...withoutWindows,
      cells: withoutWindows.cells.map((cell) => ({
        ...cell,
        gates: cell.gates.map((gate, index) =>
          cell.q === 1 && cell.r === 0 && index === direction ? "window" : gate),
      })),
    };
    assert.equal(terrainModuleSchema.safeParse(touchingDoor).success, false);
  }
  const touchingAcrossCells = {
    ...withoutWindows,
    cells: withoutWindows.cells.map((cell) => ({
      ...cell,
      gates: cell.gates.map((gate, direction) => {
        if (cell.q === 1 && cell.r === 0 && direction === 0) return "wall";
        if (cell.q === 1 && cell.r === 0 && direction === 1) return "door";
        if (cell.q === 0 && cell.r === 1 && direction === 0) return "window";
        return gate;
      }),
    })),
  };
  assert.equal(terrainModuleSchema.safeParse(touchingAcrossCells).success, false);
  const tooManyWindows = {
    ...withoutWindows,
    cells: withoutWindows.cells.map((cell) => ({
      ...cell,
      gates: cell.gates.map((gate) => gate === "wall" && cell.q <= 0 ? "window" : gate),
    })),
  };
  assert.equal(terrainModuleSchema.safeParse(tooManyWindows).success, false);
});

test("a house window may face missing terrain while its door must have a reciprocal path", () => {
  const map = {
    seed: "outward-window",
    modules: [
      { id: "abandoned-house", q: 0, r: 0, rotation: 0 },
      { id: "clearing", q: 2, r: 1, rotation: 0 },
    ],
    doorStates: [],
  };
  const cells = terrainMapCells(map);
  const window = cells.find((cell) => cell.gates.includes("window"))!;
  const offset = hexDirections[window.gates.indexOf("window")]!;
  assert.equal(cells.some((cell) => cell.q === window.q + offset.q && cell.r === window.r + offset.r), false);
  assert.throws(() => terrainMapCells({
    ...map, modules: [map.modules[0]!],
  }), /porta.*caminho externo/);
  assert.equal(generatedTerrainMapSchema.safeParse({
    ...map,
    modules: [{ ...map.modules[1]!, houseLayout: STARTER_TERRAIN_MODULES.find(({ id }) => id === "abandoned-house") }],
  }).success, false);
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
  assert.equal(first.modules.filter(({ id }) => id === "abandoned-house").length, 1);
  assert.ok(first.modules.some(({ id }) => id === "path-connector"));
  assert.equal(first.doorStates.length, 1);
  assert.ok(["open", "closed"].includes(first.doorStates[0]!.state));
  assert.deepEqual(first.doorStates, repeated.doorStates);
  assert.notDeepEqual(first.doorStates, other.doorStates);
  assert.equal(generatedTerrainMapSchema.safeParse(first).success, true);
  assert.equal(new Set(first.modules.map(({ rotation }) => rotation)).size > 1, true);
  assert.equal(new Set(first.modules.map(({ id }) => id)).size > 1, true);
  const cells = terrainMapCells(first);
  assert.equal(cells.length, first.modules.length * 7);
  assert.equal(new Set(cells.map(({ q, r }) => `${q},${r}`)).size, cells.length);
  assert.ok(cells.filter(({ traversable }) => traversable).length >= first.modules.length * 6);
  assert.equal(cells.filter(({ objectSlots }) => objectSlots.includes("lost-item")).length, 1);
  assert.equal(terrainMapCells(generateTerrainMap(320, 320, 2, "too-small")).length, 0);
  assert.ok(
    generateTerrainMap(1920, 1200, 2, "map-seed").modules.length < first.modules.length,
  );
  const maximumArena = generateTerrainMap(7680, 7680, 0.5, "maximum-arena");
  assert.ok(maximumArena.modules.length > 0);
  assert.ok(maximumArena.modules.length <= 8000);
  assert.equal(STARTER_TERRAIN_MODULES.length, 6);
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

  const gatedCells = module.cells.map((cell) => cell.q === 0 && cell.r === 0
    ? { ...cell, gates: ["door", null, null, null, null, null] as TerrainModuleCell["gates"] }
    : cell);
  const gatedTarget = { x: start.x + cellDimensions(1).width, y: start.y };
  const closedDoor = moveWithinTerrain(
    gatedCells, start, gatedTarget, 200, 1920, 1200, 1, new Set(["0,0,0"]),
  );
  const openDoor = moveWithinTerrain(gatedCells, start, gatedTarget, 200, 1920, 1200, 1);
  assert.ok(closedDoor.x < start.x + cellDimensions(1).width / 2);
  assert.ok(openDoor.x >= gatedTarget.x - 0.01);
  for (const kind of ["wall", "window"] as const) {
    const impassableCell = gatedCells.map((cell) => cell.q === 0 && cell.r === 0
      ? { ...cell, gates: [kind, null, null, null, null, null] as TerrainModuleCell["gates"] }
      : cell);
    const impassable = moveWithinTerrain(
      impassableCell, start, gatedTarget, 200, 1920, 1200, 1, new Set(["0,0,0"]),
    );
    assert.ok(impassable.x < start.x + cellDimensions(1).width / 2);
  }
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
  assert.equal(BASE_MOVEMENT_CELLS_PER_TURN, 0.5);
  assert.equal(DEFAULT_TURN_DURATION_MS, 1000);
  assert.equal(movementSpeedSchema.safeParse(0.75).success, true);
  assert.equal(movementSpeedSchema.safeParse(0).success, false);
  assert.equal(movementSpeedSchema.safeParse(Infinity).success, false);
  assert.equal(turnDurationSchema.safeParse(1000).success, true);
  assert.equal(turnDurationSchema.safeParse(99).success, false);
  assert.equal(turnDurationSchema.safeParse(60001).success, false);
  const snapshot = {
    id: "8312cb65-50ae-4fb6-879c-071b1861bd22",
    phase: "lobby",
    catalogRevision: 1,
    players: [], arena: { width: 1920, height: 1200, scale: 1 },
    remainingMs: 0, resumeRemainingMs: 0, simulationTurns: 0, chapter: "", error: "", controlSlots: [],
    visionRadiusCells: 3,
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    baseMovementCellsPerTurn: BASE_MOVEMENT_CELLS_PER_TURN,
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
    const diameter = 40 * scale;
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

test("all six hexagon sides are at least 1.2 token diameters at every scale", () => {
  for (const scale of [0.5, 1, 1.5, 2]) {
    for (const ratio of [1.2, 1.5, 2]) {
      const dimensions = cellDimensions(scale, ratio);
      assert.equal(dimensions.tokenDiameter, 40 * scale);
      assert.equal(dimensions.side, ratio * dimensions.tokenDiameter);
      const corners = hexCorners({ x: 0, y: 0 }, dimensions.radius);
      for (let direction = 0; direction < 6; direction++) {
        const from = corners[direction]!;
        const to = corners[(direction + 1) % 6]!;
        assert.ok(Math.abs(Math.hypot(to.x - from.x, to.y - from.y) - dimensions.side) < 1e-7);
      }
      assert.ok(Math.abs(dimensions.width - Math.sqrt(3) * dimensions.side) < 1e-7);
      assert.ok(Math.abs(dimensions.width / 2 - dimensions.tokenDiameter / 2 - dimensions.clearance) < 1e-7);
    }
  }
  assert.throws(() => cellDimensions(0));
  assert.throws(() => cellDimensions(Infinity));
  assert.throws(() => cellDimensions(1, 1.19));
  assert.throws(() => cellDimensions(1, Infinity));
});

test("random houses keep doors connected, windows away from doors and items away from all passages", () => {
  const rotations = new Set<number>();
  const doorStates = new Set<string>();
  const windowCounts = new Set<number>();
  const itemPositions = new Set<string>();
  let outwardWindow = false;
  let touchingWindows = false;
  for (const [width, height, scale, ratio, supported] of [
    [1920, 1200, 1, 1.2, true], [1200, 1920, 1, 1.2, true], [1920, 1200, 0.5, 1.5, true],
    [1920, 1200, 1.5, 1.2, true], [320, 320, 2, 1.2, false],
  ] as const) {
    for (let seed = 0; seed < 64; seed++) {
      const map = generateTerrainMap(width, height, scale, `exit-${seed}`, undefined, ratio);
      assert.equal(map.modules.length > 0, supported);
      if (!supported) continue;
      const house = map.modules.find(({ id }) => id === "abandoned-house")!;
      assert.ok(house.houseLayout);
      const lostItem = house.houseLayout.cells.filter(({ objectSlots }) => objectSlots.includes("lost-item"));
      assert.equal(lostItem.length, 1);
      assert.ok(lostItem.every(({ gates }) => !gates.includes("door") && !gates.includes("window")));
      itemPositions.add(`${lostItem[0]!.q},${lostItem[0]!.r}`);
      rotations.add(house.rotation);
      doorStates.add(map.doorStates[0]!.state);
      const cells = terrainMapCells(map);
      assert.deepEqual(terrainMapCells(JSON.parse(JSON.stringify(map))), cells);
      const dimensions = cellDimensions(scale, ratio);
      const point = ({ q, r }: { q: number; r: number }) => ({
        x: width / 2 + dimensions.width * (q + r / 2),
        y: height / 2 + dimensions.radius * 1.5 * r,
      });
      const edges = cells.flatMap((cell) => cell.gates.flatMap((gate, direction) => {
        if (gate !== "door" && gate !== "window") return [];
        const corners = hexCorners(point(cell), dimensions.radius);
        return [{ gate, points: [corners[(direction + 5) % 6]!, corners[direction]!] }];
      }));
      const door = edges.find(({ gate }) => gate === "door")!;
      const windows = edges.filter(({ gate }) => gate === "window");
      windowCounts.add(windows.length);
      const touching = (first: typeof door, second: typeof door) => first.points.some((a) =>
        second.points.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7));
      assert.ok(windows.every((window) => !touching(door, window)));
      touchingWindows ||= windows.some((window, index) =>
        windows.slice(index + 1).some((other) => touching(window, other)));
      const exteriorCells = cells.filter(({ terrainType }) => terrainType !== "abandoned-house");
      const exterior = new Map(exteriorCells.map((cell) => [`${cell.q},${cell.r}`, cell]));
      const root = exteriorCells.find(({ q, r }) => q === map.modules[0]!.q && r === map.modules[0]!.r)!;
      const reached = new Set([`${root.q},${root.r}`]);
      const queue = [root];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const cell = queue[cursor]!;
        for (const [direction, offset] of hexDirections.entries()) {
          const key = `${cell.q + offset.q},${cell.r + offset.r}`;
          const neighbor = exterior.get(key);
          if (!neighbor?.traversable || reached.has(key) || cell.connectors[direction] === null
            || cell.connectors[direction] !== neighbor.connectors[(direction + 3) % 6]) continue;
          reached.add(key);
          queue.push(neighbor);
        }
      }
      assert.equal(reached.size, exteriorCells.filter(({ traversable }) => traversable).length);
      for (const cell of cells) {
        for (const [direction, gate] of cell.gates.entries()) {
          if (gate !== "door" && gate !== "window") continue;
          const offset = hexDirections[direction]!;
          const neighbor = exterior.get(`${cell.q + offset.q},${cell.r + offset.r}`);
          if (gate === "window") {
            outwardWindow ||= !neighbor;
            continue;
          }
          assert.ok(neighbor?.traversable, `${gate} must not face an empty map edge`);
          assert.ok(reached.has(`${neighbor.q},${neighbor.r}`));
          assert.equal(cell.connectors[direction], neighbor.connectors[(direction + 3) % 6]);
          assert.equal(neighbor.gates[(direction + 3) % 6], null);
          const start = point(cell);
          const target = point(neighbor);
          assert.deepEqual(
            moveWithinTerrain(cells, start, target, dimensions.width * 2, width, height, scale, new Set(), ratio),
            target,
          );
          const blocked = new Set([`${cell.q},${cell.r},${direction}`]);
          assert.notDeepEqual(
            moveWithinTerrain(cells, start, target, dimensions.width * 2, width, height, scale, blocked, ratio),
            target,
          );
        }
      }
    }
  }
  assert.equal(rotations.size, 6);
  assert.deepEqual([...doorStates].sort(), ["closed", "open"]);
  assert.deepEqual([...windowCounts].sort(), [0, 1, 2, 3]);
  assert.equal(itemPositions.size, 6);
  assert.equal(outwardWindow, true);
  assert.equal(touchingWindows, true);
  assert.throws(() => terrainMapCells({
    seed: "isolated-house",
    modules: [{ id: "abandoned-house", q: 0, r: 0, rotation: 0 }],
    doorStates: [],
  }), /caminho externo/);
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
    assert.equal(cellDimensions(scale).tokenDiameter, 40 * scale);
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
