import { BASE_MOVEMENT_CELLS_PER_SECOND, movementSpeedSchema } from "@terror/contracts";
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
  BASE_MOVEMENT_CELLS_PER_SECOND: z.coerce.number().pipe(movementSpeedSchema)
    .default(BASE_MOVEMENT_CELLS_PER_SECOND),
});

export function readConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid server configuration: ${issues.join("; ")}`);
  }
  return result.data;
}
