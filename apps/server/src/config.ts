import {
  BASE_MOVEMENT_CELLS_PER_TURN, DEFAULT_TURN_DURATION_MS,
  movementSpeedSchema, turnDurationSchema,
  DEFAULT_HEX_SIDE_TOKEN_RATIO, hexSideTokenRatioSchema,
} from "@terror/contracts";
import { z } from "zod";

const secretSchema = z.string().min(32).refine(
  (value) => !value.startsWith("replace-with-"),
  "Generate a random secret; example placeholders cannot be used.",
);

const configSchema = z.object({
  POSTGRES_HOST: z.string().min(1).default("postgres"),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_DB: z.string().min(1).default("terror"),
  POSTGRES_USER: z.string().min(1).default("terror"),
  POSTGRES_PASSWORD: secretSchema,
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PLAYER_VISION_RADIUS_CELLS: z.coerce.number().int().min(1).max(12).default(3),
  HEX_SIDE_TOKEN_RATIO: z.coerce.number().pipe(hexSideTokenRatioSchema).default(DEFAULT_HEX_SIDE_TOKEN_RATIO),
  TURN_DURATION_MS: z.coerce.number().pipe(turnDurationSchema).default(DEFAULT_TURN_DURATION_MS),
  BASE_MOVEMENT_CELLS_PER_TURN: z.coerce.number().pipe(movementSpeedSchema)
    .default(BASE_MOVEMENT_CELLS_PER_TURN),
});

export function readConfig(environment: NodeJS.ProcessEnv) {
  const movementPerTurn = environment.BASE_MOVEMENT_CELLS_PER_TURN?.trim();
  const legacyMovementPerSecond = environment.BASE_MOVEMENT_CELLS_PER_SECOND?.trim();
  const legacyTurnDurationMs = Number(environment.TURN_DURATION_MS || DEFAULT_TURN_DURATION_MS);
  const result = configSchema.safeParse({
    ...environment,
    BASE_MOVEMENT_CELLS_PER_TURN: movementPerTurn || (legacyMovementPerSecond
      ? String(Number(legacyMovementPerSecond) * legacyTurnDurationMs / 1000)
      : undefined),
  });
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server configuration: ${issues.join("; ")}`);
  }
  return result.data;
}
