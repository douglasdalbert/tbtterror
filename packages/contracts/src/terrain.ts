import { z } from "zod";
import { cellDimensions, terrainLayout, type Point } from "./layout.js";

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

const identifierSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const connectorSchema = identifierSchema.nullable();

export const terrainModuleCellSchema = z.strictObject({
  q: z.number().int(),
  r: z.number().int(),
  terrainType: identifierSchema,
  traversable: z.boolean(),
  actions: z.array(identifierSchema),
  objectSlots: z.array(identifierSchema),
  connectors: z.array(connectorSchema).length(6),
}).superRefine((cell, context) => {
  if (cell.terrainType === "path" && !cell.traversable) {
    context.addIssue({ code: "custom", message: "Uma célula de caminho precisa ser transitável." });
  }
  if (cell.connectors.some((connector) => connector !== null) && !cell.traversable) {
    context.addIssue({ code: "custom", message: "Conectores só podem existir em células transitáveis." });
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

  const paths = module.cells.filter((cell) => cell.terrainType === "path" && cell.traversable);
  if (paths.length === 0) {
    context.addIssue({ code: "custom", path: ["cells"], message: "O módulo precisa conter ao menos um caminho." });
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
});

export const generatedTerrainMapSchema = z.strictObject({
  seed: z.string().min(1).max(128),
  modules: z.array(terrainModulePlacementSchema).max(8000),
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

export const BASE_MOVEMENT_CELLS_PER_SECOND = 0.5;

export function movementMultiplier(dexterity: number): number {
  const level = z.number().int().min(1).max(3).parse(dexterity);
  return 1 + (level - 1) * 0.1;
}

function axialFromPoint(point: Point, width: number, height: number, scale: number) {
  const dimensions = cellDimensions(scale);
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
): number[] {
  z.number().int().min(1).max(12).parse(radius);
  const byCoordinate = new Map(cells.map((cell, index) => [`${cell.q},${cell.r}`, index]));
  const visible = new Set<number>();
  for (const player of players) {
    const center = axialFromPoint(player.position, width, height, scale);
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
): Point {
  z.number().nonnegative().finite().parse(maxDistance);
  const layout = terrainLayout(width, height, scale);
  const dimensions = cellDimensions(scale);
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
  let previous = axialFromPoint(start, width, height, scale);
  if (!byCoordinate.get(`${previous.q},${previous.r}`)?.traversable) return { ...start };
  const sampleDistance = dimensions.width / 16;
  const steps = Math.max(1, Math.ceil(Math.hypot(destination.x - start.x, destination.y - start.y) / sampleDistance));
  let lastValid = { ...start };
  for (let step = 1; step <= steps; step++) {
    const point = {
      x: start.x + (destination.x - start.x) * step / steps,
      y: start.y + (destination.y - start.y) * step / steps,
    };
    const next = axialFromPoint(point, width, height, scale);
    if (next.q !== previous.q || next.r !== previous.r) {
      const direction = hexDirections.findIndex(({ q, r }) => q === next.q - previous.q && r === next.r - previous.r);
      const fromCell = byCoordinate.get(`${previous.q},${previous.r}`);
      const toCell = byCoordinate.get(`${next.q},${next.r}`);
      if (direction < 0 || !fromCell?.traversable || !toCell?.traversable
        || fromCell.connectors[direction] === null
        || fromCell.connectors[direction] !== toCell.connectors[(direction + 3) % 6]) return lastValid;
      previous = next;
    } else if (!byCoordinate.get(`${next.q},${next.r}`)?.traversable) return lastValid;
    lastValid = point;
  }
  return lastValid;
}

function createStarterModule(
  id: string,
  name: string,
  cells: Partial<Pick<TerrainModuleCell, "terrainType" | "traversable" | "actions" | "objectSlots" | "connectors">>[],
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
      ...cells[index],
    })),
  });
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
): GeneratedTerrainMap {
  const modules = terrainModuleCatalogSchema.parse(catalog);
  z.string().min(1).max(128).parse(seed);
  const layout = terrainLayout(width, height, scale);
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
  const root = mainComponent.reduce((best, index) =>
    distanceToCenter(index) < distanceToCenter(best) ? index : best,
  );
  const random = seededRandom(seed);
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
  for (const index of order) {
    const attached = [...neighbors[index]!].filter((neighbor) => placed.has(neighbor));
    const candidates = variants.flatMap(({ id }, variantIndex) =>
      index !== root || id === clearing.id ? [variantIndex] : [],
    ).filter((variantIndex) => attached.every((neighbor) => {
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

  return generatedTerrainMapSchema.parse({
    seed,
    modules: order.map((index) => {
      const variant = variants[placed.get(index)!]!;
      return { id: variant.id, ...origins[index]!, rotation: variant.rotation };
    }),
  });
}

export function terrainMapCells(
  map: GeneratedTerrainMap,
  catalog: TerrainModule[] = STARTER_TERRAIN_MODULES,
): (TerrainModuleCell & { q: number; r: number })[] {
  const validatedMap = generatedTerrainMapSchema.parse(map);
  const byId = new Map(terrainModuleCatalogSchema.parse(catalog).map((module) => [module.id, module]));
  const cells = validatedMap.modules.flatMap((placement) => {
    const module = byId.get(placement.id);
    if (!module) throw new Error(`O módulo ${placement.id} não existe no catálogo de terrenos.`);
    return rotateTerrainModule(module, placement.rotation).cells.map((cell) => ({
      ...cell,
      q: cell.q + placement.q,
      r: cell.r + placement.r,
    }));
  });
  const coordinates = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.q},${cell.r}`;
    if (coordinates.has(key)) throw new Error("O mapa gerado contém células sobrepostas.");
    coordinates.add(key);
  }
  return cells;
}
