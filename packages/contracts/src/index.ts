import { z } from "zod";

export { parseApiResponse } from "./http.js";
export { cellDimensions, hexCorners, terrainLayout } from "./layout.js";

const attributeSchema = z.number().int().min(1).max(3);

export const attributesSchema = z.strictObject({
  strength: attributeSchema,
  speed: attributeSchema,
  intelligence: attributeSchema,
});

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

export const matchSnapshotSchema = z.strictObject({
  id: z.uuid(),
  phase: z.literal("lobby"),
  catalogRevision: z.number().int().positive(),
});

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

// No client commands are exposed before their authoritative rules exist.
export interface ClientToServerEvents {
  "match:request": () => void;
}
