import { z } from "zod";

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

export type TerrainModuleCell = z.infer<typeof terrainModuleCellSchema>;
export type TerrainModule = z.infer<typeof terrainModuleSchema>;

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

export function terrainModulesConnect(
  first: TerrainModule,
  second: TerrainModule,
  secondOrigin: { q: number; r: number },
): boolean {
  const left = terrainModuleSchema.parse(first);
  const right = terrainModuleSchema.parse(second);
  const rightCells = right.cells.map((cell) => ({
    ...cell,
    q: cell.q + secondOrigin.q,
    r: cell.r + secondOrigin.r,
  }));
  const leftPositions = new Set(left.cells.map(({ q, r }) => `${q},${r}`));
  if (rightCells.some(({ q, r }) => leftPositions.has(`${q},${r}`))) return false;
  for (const cell of left.cells) {
    for (const [direction, offset] of hexDirections.entries()) {
      const neighbor = rightCells.find(({ q, r }) => q === cell.q + offset.q && r === cell.r + offset.r);
      if (neighbor && cell.connectors[direction] !== null
        && cell.connectors[direction] === neighbor.connectors[(direction + 3) % 6]) return true;
    }
  }
  return false;
}
