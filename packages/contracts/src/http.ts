import { z } from "zod";
import { apiErrorSchema } from "./index.js";

export async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(error.success ? error.data.error : `Falha HTTP ${response.status}.`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error("O servidor retornou dados incompatíveis com esta versão do cliente.");
  }
  return parsed.data;
}
