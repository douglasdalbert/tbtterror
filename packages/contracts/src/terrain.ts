import { z } from "zod";
import { DEFAULT_HEX_SIDE_TOKEN_RATIO, cellDimensions, terrainLayout, type Point } from "./layout.js";

export const hexDirections = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
] as const;

const moduleCoordinates = [
  { q: 0, r: 0 },
  ...hexDirections,
] as const;

function edgeVertices(q: number, r: number, direction: number): string[] {
  const corners = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]] as const;
  return [(direction + 5) % 6, direction].map((index) => {
    const [x, y] = corners[index]!;
    return `${2 * q + r + x},${3 * r + y}`;
  });
}

const identifierSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const connectorSchema = identifierSchema.nullable();
export const terrainGateSchema = z.enum(["wall", "door", "window"]);
const gateSchema = terrainGateSchema.nullable();
export const doorStateSchema = z.enum(["open", "closed", "locked", "broken"]);

export const terrainModuleCellSchema = z.strictObject({
  q: z.number().int(),
  r: z.number().int(),
  terrainType: identifierSchema,
  traversable: z.boolean(),
  actions: z.array(identifierSchema),
  objectSlots: z.array(identifierSchema),
  connectors: z.array(connectorSchema).length(6),
  gates: z.array(gateSchema).length(6).default(Array(6).fill(null)),
}).superRefine((cell, context) => {
  if (cell.terrainType === "path" && !cell.traversable) {
    context.addIssue({ code: "custom", message: "Uma célula de caminho precisa ser transitável." });
  }
  if (new Set(cell.actions).size !== cell.actions.length) {
    context.addIssue({ code: "custom", message: "Uma célula não pode repetir ações." });
  }
  if (new Set(cell.objectSlots).size !== cell.objectSlots.length) {
    context.addIssue({ code: "custom", message: "Uma célula não pode repetir receptores de objetos." });
  }
});

export const terrainModuleSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  cells: z.array(terrainModuleCellSchema).length(7),
}).superRefine((module, context) => {
  const cells = new Map<string, z.infer<typeof terrainModuleCellSchema>>();
  for (const [index, cell] of module.cells.entries()) {
    const key = `${cell.q},${cell.r}`;
    if (!moduleCoordinates.some(({ q, r }) => q === cell.q && r === cell.r)) {
      context.addIssue({
        code: "custom",
        path: ["cells", index],
        message: "A célula precisa ocupar uma das sete posições do módulo.",
      });
    } else if (cells.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["cells", index],
        message: "As sete posições do módulo precisam ser únicas.",
      });
    } else {
      cells.set(key, cell);
    }
  }
  if (cells.size !== 7) return;

  const paths = module.cells.filter((cell) => cell.traversable);
  if (paths.length === 0) {
    context.addIssue({ code: "custom", path: ["cells"], message: "O módulo precisa conter ao menos uma célula transitável." });
  }

  for (const cell of module.cells) {
    for (const [direction, offset] of hexDirections.entries()) {
      const neighbor = cells.get(`${cell.q + offset.q},${cell.r + offset.r}`);
      if (!neighbor) continue;
      const reverse = neighbor.connectors[(direction + 3) % 6];
      if (cell.connectors[direction] !== reverse) {
        context.addIssue({
          code: "custom",
          path: ["cells"],
          message: "Conectores entre células do módulo precisam ser recíprocos.",
        });
      }
      if (cell.gates[direction] !== null || neighbor.gates[(direction + 3) % 6] !== null) {
        context.addIssue({
          code: "custom",
          path: ["cells"],
          message: "Portas, janelas e paredes só podem ocupar bordas externas do módulo.",
        });
      }
    }
  }

  if (module.id === "abandoned-house") {
    const lostItemCells = module.cells.filter((cell) => cell.objectSlots.includes("lost-item"));
    const gates = module.cells.flatMap((cell) => cell.gates.filter((gate) => gate !== null));
    if (lostItemCells.length !== 1
      || lostItemCells.some((cell) => cell.gates.some((gate) => gate === "door" || gate === "window"))
      || module.cells.some((cell) => cell.objectSlots.some((slot) => slot !== "lost-item"))) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: "A casa precisa ter exatamente um receptor de item perdido em uma célula sem porta nem janela.",
      });
    }
    if (gates.length !== 18
      || gates.filter((gate) => gate === "door").length !== 1
      || gates.filter((gate) => gate === "window").length > 3) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: "A casa precisa ter uma porta, de zero a três janelas e paredes nas demais bordas externas.",
      });
    }
    const doorVertices = new Set(module.cells.flatMap((cell) => cell.gates.flatMap((gate, direction) =>
      gate === "door" ? edgeVertices(cell.q, cell.r, direction) : [],
    )));
    if (module.cells.some((cell) => cell.gates.some((gate, direction) =>
      gate === "window" && edgeVertices(cell.q, cell.r, direction).some((vertex) => doorVertices.has(vertex)),
    ))) {
      context.addIssue({ code: "custom", path: ["cells"], message: "Uma janela nunca pode tocar na porta." });
    }
    if (module.cells.some((cell) => cell.terrainType !== "abandoned-house")) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: "Todas as células da casa precisam manter o tipo de terreno da casa.",
      });
    }
  }

  if (paths.length > 1) {
    const connected = new Set<string>();
    const queue = [paths[0]!];
    while (queue.length > 0) {
      const cell = queue.shift()!;
      const key = `${cell.q},${cell.r}`;
      if (connected.has(key)) continue;
      connected.add(key);
      for (const [direction, offset] of hexDirections.entries()) {
        if (cell.connectors[direction] === null) continue;
        const neighbor = cells.get(`${cell.q + offset.q},${cell.r + offset.r}`);
        if (neighbor?.traversable && neighbor.connectors[(direction + 3) % 6] === cell.connectors[direction]) {
          queue.push(neighbor);
        }
      }
    }
    if (paths.some((cell) => !connected.has(`${cell.q},${cell.r}`))) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: "Todos os caminhos do módulo precisam estar conectados.",
      });
    }
  }
});

export const terrainModuleCatalogSchema = z.array(terrainModuleSchema).min(1).superRefine((modules, context) => {
  if (new Set(modules.map(({ id }) => id)).size !== modules.length) {
    context.addIssue({ code: "custom", message: "IDs de módulos precisam ser únicos." });
  }
  if (!modules.some((module) => module.cells.some((cell) => cell.actions.length > 0))) {
    context.addIssue({ code: "custom", message: "O catálogo precisa conter uma célula com ação." });
  }
  if (!modules.some((module) => module.cells.some((cell) => cell.objectSlots.length > 0))) {
    context.addIssue({ code: "custom", message: "O catálogo precisa conter uma célula receptora de objetos." });
  }
});

const terrainModulePlacementSchema = z.strictObject({
  id: identifierSchema,
  q: z.number().int(),
  r: z.number().int(),
  rotation: z.number().int().min(0).max(5),
  houseLayout: terrainModuleSchema.optional(),
}).refine((placement) => !placement.houseLayout
  || (placement.id === "abandoned-house" && placement.houseLayout.id === placement.id), {
  message: "Somente a casa abandonada pode ter uma disposição interna sorteada.",
});

export const generatedTerrainMapSchema = z.strictObject({
  seed: z.string().min(1).max(128),
  modules: z.array(terrainModulePlacementSchema).max(8000),
  doorStates: z.array(z.strictObject({
    q: z.number().int(),
    r: z.number().int(),
    direction: z.number().int().min(0).max(5),
    state: doorStateSchema,
  })).default([]),
}).superRefine((map, context) => {
  const origins = new Set<string>();
  for (const [index, module] of map.modules.entries()) {
    const key = `${module.q},${module.r}`;
    if (origins.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["modules", index],
        message: "Dois módulos não podem ocupar a mesma origem.",
      });
    }
    origins.add(key);
  }
});

export type TerrainModuleCell = z.infer<typeof terrainModuleCellSchema>;
export type TerrainModule = z.infer<typeof terrainModuleSchema>;
export type GeneratedTerrainMap = z.infer<typeof generatedTerrainMapSchema>;
export type TerrainGate = Exclude<TerrainModuleCell["gates"][number], null>;
export type DoorState = z.infer<typeof doorStateSchema>;

export const BASE_MOVEMENT_CELLS_PER_TURN = 0.5;
export const DEFAULT_TURN_DURATION_MS = 1000;
export const movementSpeedSchema = z.number().positive().finite();
export const turnDurationSchema = z.number().int().min(100).max(60000);

export function movementMultiplier(dexterity: number): number {
  const level = z.number().int().min(1).max(3).parse(dexterity);
  return 1 + (level - 1) * 0.1;
}

export function axialFromPoint(
  point: Point, width: number, height: number, scale: number, hexSideTokenRatio: number,
) {
  const dimensions = cellDimensions(scale, hexSideTokenRatio);
  const fractionalR = (point.y - height / 2) / (dimensions.radius * 1.5);
  const fractionalQ = (point.x - width / 2) / dimensions.width - fractionalR / 2;
  const fractionalS = -fractionalQ - fractionalR;
  let q = Math.round(fractionalQ);
  let r = Math.round(fractionalR);
  let s = Math.round(fractionalS);
  const qDifference = Math.abs(q - fractionalQ);
  const rDifference = Math.abs(r - fractionalR);
  const sDifference = Math.abs(s - fractionalS);
  if (qDifference > rDifference && qDifference > sDifference) q = -r - s;
  else if (rDifference > sDifference) r = -q - s;
  return { q, r };
}

export function visibleTerrainCellIndices(
  players: { position: Point }[],
  cells: { q: number; r: number }[],
  width: number,
  height: number,
  scale: number,
  radius: number,
  hexSideTokenRatio = DEFAULT_HEX_SIDE_TOKEN_RATIO,
): number[] {
  z.number().int().min(1).max(12).parse(radius);
  const byCoordinate = new Map(cells.map((cell, index) => [`${cell.q},${cell.r}`, index]));
  const visible = new Set<number>();
  for (const player of players) {
    const center = axialFromPoint(player.position, width, height, scale, hexSideTokenRatio);
    for (let qOffset = -radius; qOffset <= radius; qOffset++) {
      const minimumROffset = Math.max(-radius, -qOffset - radius);
      const maximumROffset = Math.min(radius, -qOffset + radius);
      for (let rOffset = minimumROffset; rOffset <= maximumROffset; rOffset++) {
        const index = byCoordinate.get(`${center.q + qOffset},${center.r + rOffset}`);
        if (index !== undefined) visible.add(index);
      }
    }
  }
  return [...visible].sort((first, second) => first - second);
}

export function moveWithinTerrain(
  cells: (TerrainModuleCell & { q: number; r: number })[],
  start: Point,
  requested: Point,
  maxDistance: number,
  width: number,
  height: number,
  scale: number,
  blockedGates: ReadonlySet<string> = new Set(),
  hexSideTokenRatio = DEFAULT_HEX_SIDE_TOKEN_RATIO,
): Point {
  z.number().nonnegative().finite().parse(maxDistance);
  const layout = terrainLayout(width, height, scale, hexSideTokenRatio);
  const dimensions = cellDimensions(scale, hexSideTokenRatio);
  const radius = dimensions.tokenDiameter / 2;
  const target = {
    x: Math.max(layout.area.x + radius, Math.min(layout.area.x + layout.area.width - radius, requested.x)),
    y: Math.max(layout.area.y + radius, Math.min(layout.area.y + layout.area.height - radius, requested.y)),
  };
  const deltaX = target.x - start.x;
  const deltaY = target.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0 || maxDistance === 0) return { ...start };
  const fraction = Math.min(1, maxDistance / distance);
  const destination = {
    x: start.x + deltaX * fraction,
    y: start.y + deltaY * fraction,
  };
  const byCoordinate = new Map(cells.map((cell) => [`${cell.q},${cell.r}`, cell]));
  let previous = axialFromPoint(start, width, height, scale, hexSideTokenRatio);
  if (!byCoordinate.get(`${previous.q},${previous.r}`)?.traversable) return { ...start };
  const sampleDistance = dimensions.width / 16;
  const steps = Math.max(1, Math.ceil(Math.hypot(destination.x - start.x, destination.y - start.y) / sampleDistance));
  let lastValid = { ...start };
  for (let step = 1; step <= steps; step++) {
    const point = {
      x: start.x + (destination.x - start.x) * step / steps,
      y: start.y + (destination.y - start.y) * step / steps,
    };
    const next = axialFromPoint(point, width, height, scale, hexSideTokenRatio);
    if (next.q !== previous.q || next.r !== previous.r) {
      const direction = hexDirections.findIndex(({ q, r }) => q === next.q - previous.q && r === next.r - previous.r);
      const fromCell = byCoordinate.get(`${previous.q},${previous.r}`);
      const toCell = byCoordinate.get(`${next.q},${next.r}`);
      if (direction < 0 || !fromCell?.traversable || !toCell?.traversable
        || fromCell.connectors[direction] === null
        || fromCell.connectors[direction] !== toCell.connectors[(direction + 3) % 6]
        || blockedGates.has(`${previous.q},${previous.r},${direction}`)
        || blockedGates.has(`${next.q},${next.r},${(direction + 3) % 6}`)) return lastValid;
      previous = next;
    } else if (!byCoordinate.get(`${next.q},${next.r}`)?.traversable) return lastValid;
    lastValid = point;
  }
  return lastValid;
}

function createStarterModule(
  id: string,
  name: string,
  cells: Partial<Pick<TerrainModuleCell, "terrainType" | "traversable" | "actions" | "objectSlots" | "connectors" | "gates">>[],
): TerrainModule {
  return terrainModuleSchema.parse({
    id,
    name,
    cells: moduleCoordinates.map(({ q, r }, index) => ({
      q,
      r,
      terrainType: "path",
      traversable: true,
      actions: [],
      objectSlots: [],
      connectors: Array(6).fill("path"),
      gates: Array(6).fill(null),
      ...cells[index],
    })),
  });
}

function createAbandonedHouseModule(): TerrainModule {
  const coordinates = new Set(moduleCoordinates.map(({ q, r }) => `${q},${r}`));
  const cells = moduleCoordinates.map(({ q, r }) => {
    const gates = hexDirections.map(({ q: dq, r: dr }, direction) => {
      if (coordinates.has(`${q + dq},${r + dr}`)) return null;
      if (q === 1 && r === 0 && direction === 0) return "door";
      if (q === -1 && r === 0 && direction === 3) return "window";
      return "wall";
    });
    return {
      q,
      r,
      terrainType: "abandoned-house",
      traversable: true,
      actions: [],
      objectSlots: q === 0 && r === 0 ? ["lost-item"] : [],
      connectors: Array(6).fill("path"),
      gates,
    };
  });
  return terrainModuleSchema.parse({ id: "abandoned-house", name: "Casa abandonada", cells });
}

export const STARTER_TERRAIN_MODULES = terrainModuleCatalogSchema.parse([
  createStarterModule("clearing", "Clareira", [
    { terrainType: "clearing", actions: ["start"] },
  ]),
  createStarterModule("cabin", "Cabana", [
    { terrainType: "room" },
    { actions: ["search"] },
    { objectSlots: ["item"] },
  ]),
  createStarterModule("grove", "Bosque", [
    {},
    {},
    {},
    {},
    {},
    { terrainType: "clearing", objectSlots: ["item"] },
  ]),
  createStarterModule("stonewall", "Muro de pedra", [
    { terrainType: "wall", traversable: false, connectors: Array(6).fill(null) },
    { connectors: ["path", "path", "path", null, "path", "path"] },
    { connectors: ["path", "path", "path", "path", null, "path"] },
    { connectors: ["path", "path", "path", "path", "path", null] },
    { connectors: [null, "path", "path", "path", "path", "path"] },
    { connectors: ["path", null, "path", "path", "path", "path"] },
    { connectors: ["path", "path", null, "path", "path", "path"] },
  ]),
  createStarterModule("path-connector", "Trilha de ligação", []),
  createAbandonedHouseModule(),
]);

export function rotateTerrainModule(module: TerrainModule, steps: number): TerrainModule {
  const validated = terrainModuleSchema.parse(module);
  z.number().int().min(0).max(5).parse(steps);
  if (steps === 0) return structuredClone(validated);
  return terrainModuleSchema.parse({
    ...validated,
    cells: validated.cells.map((cell) => {
      let { q, r } = cell;
      for (let turn = 0; turn < steps; turn++) {
        const nextQ = -r;
        const nextR = q + r;
        q = nextQ === 0 ? 0 : nextQ;
        r = nextR === 0 ? 0 : nextR;
      }
      return {
        ...cell,
        q,
        r,
        connectors: cell.connectors.map((_, direction) =>
          cell.connectors[(direction - steps + 6) % 6] ?? null,
        ),
        gates: cell.gates.map((_, direction) =>
          cell.gates[(direction - steps + 6) % 6] ?? null,
        ),
      };
    }),
  });
}

function modulesConnectValidated(
  left: TerrainModule,
  right: TerrainModule,
  secondOrigin: { q: number; r: number },
): boolean {
  const rightCells = new Map(right.cells.map((cell) => [
    `${cell.q + secondOrigin.q},${cell.r + secondOrigin.r}`,
    cell,
  ]));
  const leftPositions = new Set(left.cells.map(({ q, r }) => `${q},${r}`));
  if ([...rightCells.keys()].some((key) => leftPositions.has(key))) return false;
  let connected = false;
  for (const cell of left.cells) {
    for (const [direction, offset] of hexDirections.entries()) {
      const neighbor = rightCells.get(`${cell.q + offset.q},${cell.r + offset.r}`);
      if (!neighbor) continue;
      const connector = cell.connectors[direction];
      if (connector !== neighbor.connectors[(direction + 3) % 6]) return false;
      if (connector !== null) connected = true;
    }
  }
  return connected;
}

export function terrainModulesConnect(
  first: TerrainModule,
  second: TerrainModule,
  secondOrigin: { q: number; r: number },
): boolean {
  return modulesConnectValidated(
    terrainModuleSchema.parse(first),
    terrainModuleSchema.parse(second),
    secondOrigin,
  );
}

function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function randomizeHouse(module: TerrainModule, random: () => number): TerrainModule {
  const cells = structuredClone(module.cells);
  const doorVertices = new Set(cells.flatMap((cell) => cell.gates.flatMap((gate, direction) =>
    gate === "door" ? edgeVertices(cell.q, cell.r, direction) : [],
  )));
  const candidates = cells.flatMap((cell) => {
    cell.objectSlots = [];
    return cell.gates.flatMap((gate, direction) => {
      if (gate === "window") cell.gates[direction] = "wall";
      if (gate !== "wall" && gate !== "window") return [];
      return edgeVertices(cell.q, cell.r, direction).some((vertex) => doorVertices.has(vertex))
        ? [] : [{ cell, direction }];
    });
  });
  const windowCount = Math.floor(random() * 4);
  for (const { cell, direction } of shuffled(candidates, random).slice(0, windowCount)) {
    cell.gates[direction] = "window";
  }
  const itemCells = cells.filter((cell) => !cell.gates.some((gate) => gate === "door" || gate === "window"));
  itemCells[Math.floor(random() * itemCells.length)]!.objectSlots = ["lost-item"];
  return terrainModuleSchema.parse({ ...module, cells });
}

function placementOrigin(placement: { cells: { q: number; r: number }[] }) {
  return {
    q: Math.round(placement.cells.reduce((sum, cell) => sum + cell.q, 0) / placement.cells.length),
    r: Math.round(placement.cells.reduce((sum, cell) => sum + cell.r, 0) / placement.cells.length),
  };
}

export function generateTerrainMap(
  width: number,
  height: number,
  scale: number,
  seed: string,
  catalog: TerrainModule[] = STARTER_TERRAIN_MODULES,
  hexSideTokenRatio = DEFAULT_HEX_SIDE_TOKEN_RATIO,
): GeneratedTerrainMap {
  const validatedCatalog = terrainModuleCatalogSchema.parse(catalog);
  z.string().min(1).max(128).parse(seed);
  const layout = terrainLayout(width, height, scale, hexSideTokenRatio);
  if (layout.placements.length === 0) return generatedTerrainMapSchema.parse({ seed, modules: [] });

  const origins = layout.placements.map(placementOrigin);
  const cellOwners = new Map<string, number>();
  layout.placements.forEach((placement, index) => {
    for (const cell of placement.cells) cellOwners.set(`${cell.q},${cell.r}`, index);
  });
  const neighbors = layout.placements.map(() => new Set<number>());
  layout.placements.forEach((placement, index) => {
    for (const cell of placement.cells) {
      for (const direction of hexDirections) {
        const owner = cellOwners.get(`${cell.q + direction.q},${cell.r + direction.r}`);
        if (owner !== undefined && owner !== index) neighbors[index]!.add(owner);
      }
    }
  });

  const components: number[][] = [];
  const visited = new Set<number>();
  for (let start = 0; start < layout.placements.length; start++) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    let queueIndex = 0;
    visited.add(start);
    while (queueIndex < queue.length) {
      const index = queue[queueIndex++]!;
      component.push(index);
      for (const neighbor of neighbors[index]!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }

  const distanceToCenter = (index: number) => {
    const center = layout.placements[index]!.center;
    return Math.hypot(center.x - width / 2, center.y - height / 2);
  };
  components.sort((left, right) =>
    right.length - left.length || distanceToCenter(left[0]!) - distanceToCenter(right[0]!),
  );
  const mainComponent = components[0]!;
  const mainComponentSet = new Set(mainComponent);
  let root = mainComponent.reduce((best, index) =>
    distanceToCenter(index) < distanceToCenter(best) ? index : best,
  );
  const random = seededRandom(seed);
  const modules = validatedCatalog.map((module) =>
    module.id === "abandoned-house" ? randomizeHouse(module, random) : module,
  );
  const order: number[] = [];
  const orderQueue = [root];
  const ordered = new Set([root]);
  let orderQueueIndex = 0;
  while (orderQueueIndex < orderQueue.length) {
    const index = orderQueue[orderQueueIndex++]!;
    order.push(index);
    for (const neighbor of shuffled([...neighbors[index]!], random)) {
      if (!mainComponentSet.has(neighbor) || ordered.has(neighbor)) continue;
      ordered.add(neighbor);
      orderQueue.push(neighbor);
    }
  }

  const variants = modules.flatMap((module) => Array.from({ length: 6 }, (_, rotation) => ({
    id: module.id,
    rotation,
    module: rotateTerrainModule(module, rotation),
  })));
  const compatibility = new Map<string, boolean>();
  const connects = (firstIndex: number, secondIndex: number, origin: { q: number; r: number }) => {
    const key = `${firstIndex}:${secondIndex}:${origin.q},${origin.r}`;
    if (!compatibility.has(key)) {
      compatibility.set(key, modulesConnectValidated(
        variants[firstIndex]!.module,
        variants[secondIndex]!.module,
        origin,
      ));
    }
    return compatibility.get(key)!;
  };
  const placed = new Map<number, number>();
  const clearing = modules.find((module) => module.id === "clearing") ?? modules[0]!;
  const pathConnector = modules.find((module) => module.id === "path-connector");
  const abandonedHouse = modules.find((module) => module.id === "abandoned-house");
  let housePlacement: { index: number; variant: number; paths: number[] } | undefined;
  if (abandonedHouse) {
    if (!pathConnector) throw new Error("A casa precisa de um módulo de trilha para ligar suas passagens ao mapa.");
    const houseVariants = variants.flatMap(({ id }, index) => id === abandonedHouse.id ? [index] : []);
    for (const index of shuffled(order, random)) {
      // Keep the exterior connected independently of the house's closed passages.
      const exteriorRoot = order.find((candidate) => candidate !== index);
      if (exteriorRoot === undefined) continue;
      const exterior = new Set([exteriorRoot]);
      const queue = [exteriorRoot];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        for (const neighbor of neighbors[queue[cursor]!]!) {
          if (neighbor === index || exterior.has(neighbor)) continue;
          exterior.add(neighbor);
          queue.push(neighbor);
        }
      }
      if (exterior.size !== order.length - 1) continue;
      const origin = origins[index]!;
      for (const variantIndex of shuffled(houseVariants, random)) {
        const house = variants[variantIndex]!.module;
        const paths: number[] = [];
        let valid = true;
        for (const cell of house.cells) {
          for (const [direction, gate] of cell.gates.entries()) {
            if (gate !== "door") continue;
            const offset = hexDirections[direction]!;
            const owner = cellOwners.get(`${origin.q + cell.q + offset.q},${origin.r + cell.r + offset.r}`);
            if (owner === undefined || !exterior.has(owner)) valid = false;
            else paths.push(owner);
          }
        }
        if (valid && paths.length === 1) {
          housePlacement = { index, variant: variantIndex, paths };
          break;
        }
      }
      if (housePlacement) break;
    }
    if (!housePlacement) return generatedTerrainMapSchema.parse({ seed, modules: [] });
    if (housePlacement.index === root) {
      const houseIndex = housePlacement.index;
      root = order.find((index) => index !== houseIndex)!;
      order.splice(order.indexOf(root), 1);
      order.unshift(root);
    }
  }
  for (const index of order) {
    const attached = [...neighbors[index]!].filter((neighbor) => placed.has(neighbor));
    const candidates = variants.flatMap(({ id }, variantIndex) => {
      if (index === root) return id === clearing.id ? [variantIndex] : [];
      if (index === housePlacement?.index) return variantIndex === housePlacement.variant ? [variantIndex] : [];
      if (id === abandonedHouse?.id) return [];
      if (housePlacement?.paths.includes(index)) return id === pathConnector?.id ? [variantIndex] : [];
      return [variantIndex];
    }).filter((variantIndex) => attached.every((neighbor) => {
        const origin = origins[index]!;
        const parentOrigin = origins[neighbor]!;
        return connects(
          placed.get(neighbor)!,
          variantIndex,
          { q: origin.q - parentOrigin.q, r: origin.r - parentOrigin.r },
        );
      }));
    if (candidates.length === 0) {
      throw new Error("Não foi possível encaixar os módulos de terreno sem conectores incompatíveis.");
    }
    placed.set(index, candidates[Math.floor(random() * candidates.length)]!);
  }

  const placements = order.map((index) => {
    const variant = variants[placed.get(index)!]!;
    return {
      id: variant.id, ...origins[index]!, rotation: variant.rotation,
      ...(variant.id === "abandoned-house" ? { houseLayout: abandonedHouse } : {}),
    };
  });
  const doorStates = placements.flatMap((placement) => {
    const module = modules.find(({ id }) => id === placement.id);
    if (!module) return [];
    return rotateTerrainModule(module, placement.rotation).cells.flatMap((cell) =>
      cell.gates.flatMap((gate, direction) => gate === "door" ? [{
        q: cell.q + placement.q,
        r: cell.r + placement.r,
        direction,
        state: random() < 0.5 ? "open" as const : "closed" as const,
      }] : []),
    );
  });

  const map = generatedTerrainMapSchema.parse({
    seed,
    modules: placements,
    doorStates,
  });
  terrainMapCells(map, modules);
  return map;
}

export function terrainMapCells(
  map: GeneratedTerrainMap,
  catalog: TerrainModule[] = STARTER_TERRAIN_MODULES,
): (TerrainModuleCell & { q: number; r: number })[] {
  const validatedMap = generatedTerrainMapSchema.parse(map);
  const byId = new Map(terrainModuleCatalogSchema.parse(catalog).map((module) => [module.id, module]));
  const cells = validatedMap.modules.flatMap((placement) => {
    const template = byId.get(placement.id);
    if (!template) throw new Error(`O módulo ${placement.id} não existe no catálogo de terrenos.`);
    const module = placement.houseLayout ?? template;
    return rotateTerrainModule(module, placement.rotation).cells.map((cell) => ({
      ...cell,
      q: cell.q + placement.q,
      r: cell.r + placement.r,
    }));
  });
  const coordinates = new Map<string, TerrainModuleCell>();
  for (const cell of cells) {
    const key = `${cell.q},${cell.r}`;
    if (coordinates.has(key)) throw new Error("O mapa gerado contém células sobrepostas.");
    coordinates.set(key, cell);
  }
  for (const cell of cells) {
    for (const [direction, gate] of cell.gates.entries()) {
      if (gate !== "door") continue;
      const offset = hexDirections[direction]!;
      const neighbor = coordinates.get(`${cell.q + offset.q},${cell.r + offset.r}`);
      const reverse = (direction + 3) % 6;
      if (!cell.traversable || !neighbor?.traversable
        || cell.connectors[direction] === null
        || cell.connectors[direction] !== neighbor.connectors[reverse]
        || neighbor.gates[reverse] !== null) {
        throw new Error("Toda porta precisa de um caminho externo transitável com encaixe recíproco.");
      }
    }
  }
  return cells;
}
