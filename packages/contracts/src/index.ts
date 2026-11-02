import { z } from "zod";
import { playerColorSchema } from "./playerColors.js";

export { parseApiResponse } from "./http.js";
export { boardArea, cellDimensions, hexCorners, playerSectorDepth, terrainLayout, tokenHitCircle, initialTokenPosition } from "./layout.js";
export {
  hexDirections, rotateTerrainModule, terrainModuleCellSchema, terrainModuleCatalogSchema,
  terrainModuleSchema, terrainModulesConnect, type TerrainModule, type TerrainModuleCell,
} from "./terrain.js";
export { PLAYER_COLOR_IDS, PLAYER_COLORS, playerColorSchema, type PlayerColor } from "./playerColors.js";
export { enterPreparationPlayer, leavePreparationPlayer, changePreparationAttribute, rotatePlayerName, playerNameSchema, type PreparationState } from "./preparation.js";

const attributeSchema = z.number().int().min(1).max(3);

export const attributesSchema = z.strictObject({
  strength: attributeSchema,
  dexterity: attributeSchema,
  wisdom: attributeSchema,
});

export type Attributes = z.infer<typeof attributesSchema>;
export type AttributeName = keyof Attributes;
export const ATTRIBUTE_POINTS = 3;

export const playerAttributesSchema = attributesSchema.refine(
  (attributes) => attributes.strength + attributes.dexterity + attributes.wisdom <= 3 + ATTRIBUTE_POINTS,
  "A distribuição excede os três pontos disponíveis.",
);

export function initialPlayerAttributes(): Attributes {
  return { strength: 1, dexterity: 1, wisdom: 1 };
}

export function availableAttributePoints(attributes: Attributes): number {
  const validated = playerAttributesSchema.parse(attributes);
  return 3 + ATTRIBUTE_POINTS - validated.strength - validated.dexterity - validated.wisdom;
}

export function allocateAttributePoint(attributes: Attributes, attribute: AttributeName, delta: 1 | -1): Attributes {
  const validated = playerAttributesSchema.parse(attributes);
  return playerAttributesSchema.parse({ ...validated, [attribute]: validated[attribute] + delta });
}

export const characterSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: attributesSchema,
  health: z.number().int().positive(),
});

export const monsterSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: attributesSchema,
  movementMultiplier: z.number().positive(),
  capabilities: z.array(z.enum(["sleep", "wound", "transform"])).min(1),
  trapLimit: z.number().int().nonnegative(),
  sleepingVisionMultiplier: z.number().positive().max(1),
});

export const settingsSchema = z.strictObject({
  maxPlayers: z.literal(8),
  minimumTouchPoints: z.literal(10),
  countdownSeconds: z.literal(10),
  moduleCells: z.literal(7),
  rotationStepDegrees: z.literal(60),
});

export const catalogSchema = z.strictObject({
  revision: z.number().int().positive(),
  characters: z.array(characterSchema).min(1),
  monsters: z.array(monsterSchema).min(1),
  settings: settingsSchema,
});

export const arenaSchema = z.strictObject({
  width: z.number().finite().min(320).max(7680),
  height: z.number().finite().min(320).max(7680),
  scale: z.number().min(0.5).max(2),
});
export const pointSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const matchPlayerSchema = z.strictObject({
  slot: z.number().int().min(0).max(7),
  name: z.string().regex(/^[A-Z]{3}$/),
  color: playerColorSchema,
  attributes: playerAttributesSchema,
  ready: z.boolean(),
  resumeReady: z.boolean(),
  connected: z.boolean(),
  pressed: z.boolean(),
  position: pointSchema,
});

export const matchSnapshotSchema = z.strictObject({
  id: z.uuid(),
  phase: z.enum(["lobby", "countdown", "chapter", "running", "paused"]),
  catalogRevision: z.number().int().positive(),
  players: z.array(matchPlayerSchema).max(8),
  arena: arenaSchema,
  remainingMs: z.number().nonnegative(),
  resumeRemainingMs: z.number().nonnegative().max(10000),
  simulationMs: z.number().nonnegative(),
  chapter: z.string(),
  error: z.string(),
  controlSlots: z.array(z.number().int().min(0).max(7)).max(8),
});

const slot = z.number().int().min(0).max(7);
export const matchCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("join"), slot, name: z.string().regex(/^[A-Z]{3}$/), color: playerColorSchema }),
  z.strictObject({ type: z.literal("leave"), slot }),
  z.strictObject({ type: z.literal("attribute"), slot, attribute: z.enum(["strength", "dexterity", "wisdom"]), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.strictObject({ type: z.literal("scale"), slot, delta: z.union([z.literal(-0.05), z.literal(0.05)]) }),
  z.strictObject({ type: z.literal("viewport"), width: arenaSchema.shape.width, height: arenaSchema.shape.height }),
  z.strictObject({ type: z.literal("ready"), slot, value: z.boolean() }),
  z.strictObject({ type: z.literal("pause"), slot }),
  z.strictObject({ type: z.literal("resume"), slot, value: z.boolean() }),
  z.strictObject({ type: z.literal("press"), slot }),
  z.strictObject({ type: z.literal("release"), slot }),
  z.strictObject({ type: z.literal("move"), slot, position: pointSchema }),
]);
export const commandResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), error: z.string().min(1) }),
]);
export type MatchCommand = z.infer<typeof matchCommandSchema>;
export type CommandResult = z.infer<typeof commandResultSchema>;
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;
export type Arena = z.infer<typeof arenaSchema>;
export const healthSchema = z.strictObject({
  status: z.literal("ok"),
  database: z.literal("ready"),
});

export const apiErrorSchema = z.strictObject({
  error: z.string().min(1),
});

export const adminOverviewSchema = z.strictObject({
  revision: z.number().int().positive(),
  counts: z.strictObject({
    characters: z.number().int().nonnegative(),
    monsters: z.number().int().nonnegative(),
  }),
});

export type Catalog = z.infer<typeof catalogSchema>;
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>;
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export interface ServerToClientEvents {
  "match:snapshot": (snapshot: MatchSnapshot) => void;
}

export interface ClientToServerEvents {
  "match:request": () => void;
  "match:command": (command: MatchCommand, reply: (result: CommandResult) => void) => void;
}
