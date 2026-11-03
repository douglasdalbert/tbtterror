import { z } from "zod";
import type { DoorState } from "./terrain.js";

export const doorActionSchema = z.enum(["open", "close", "lock", "unlock", "break", "jump-window"]);
export type GateAction = z.infer<typeof doorActionSchema>;
export type DoorAction = Exclude<GateAction, "jump-window">;
export const DOOR_ACTION_RULES = {
  open: { label: "Abrir porta", durationTurns: 1, strength: 1, dexterity: 1 },
  close: { label: "Fechar porta", durationTurns: 1, strength: 1, dexterity: 1 },
  lock: { label: "Trancar porta", durationTurns: 1, strength: 1, dexterity: 1 },
  unlock: { label: "Destrancar porta", durationTurns: 1, strength: 1, dexterity: 1 },
  break: { label: "Arrombar porta", durationTurns: 2, strength: 3, dexterity: 1 },
  "jump-window": { label: "Pular a janela", durationTurns: 1, strength: 1, dexterity: 2 },
} as const;

export const doorTargetSchema = z.strictObject({
  q: z.number().int(),
  r: z.number().int(),
  direction: z.number().int().min(0).max(5),
});
export const doorActionOptionSchema = doorTargetSchema.extend({
  slot: z.number().int().min(0).max(7),
  action: doorActionSchema,
  available: z.boolean().default(true),
});
export const activeDoorActionSchema = doorActionOptionSchema.extend({
  startedTurn: z.number().finite().nonnegative(),
});

export type DoorTarget = z.infer<typeof doorTargetSchema>;
export type DoorActionOption = z.infer<typeof doorActionOptionSchema>;
export type ActiveDoorAction = z.infer<typeof activeDoorActionSchema>;

export function doorActionsForState(state: DoorState, inside: boolean): DoorAction[] {
  switch (state) {
    case "closed": return inside ? ["open", "lock"] : ["open"];
    case "open": return ["close"];
    case "locked": return inside ? ["unlock", "break"] : ["break"];
    case "broken": return [];
  }
}

export function doorStateAfterAction(action: DoorAction): DoorState {
  switch (action) {
    case "open": return "open";
    case "close": case "unlock": return "closed";
    case "lock": return "locked";
    case "break": return "broken";
  }
}
