import { z } from "zod";
import { allocateAttributePoint, initialPlayerAttributes, playerAttributesSchema, type Attributes, type AttributeName } from "./index.js";
import { playerColorSchema, type PlayerColor } from "./playerColors.js";

export const playerNameSchema = z.string().regex(/^[A-Z]{3}$/, "Escolha três letras de A a Z.");
const slotSchema = z.number().int().min(0).max(7);

export interface PreparationState {
  players: Record<number, { name: string; color: PlayerColor; attributes: Attributes }>;
  errors: Record<number, string>;
}

export function rotatePlayerName(name: string, index: number, delta: number): string {
  playerNameSchema.parse(name);
  z.number().int().min(0).max(2).parse(index);
  z.number().int().parse(delta);
  return Array.from(name, (letter, position) => position === index
    ? String.fromCharCode(65 + ((letter.charCodeAt(0) - 65 + delta) % 26 + 26) % 26)
    : letter).join("");
}

export function enterPreparationPlayer(
  state: PreparationState, slot: number, name: string, color: PlayerColor,
): PreparationState {
  slotSchema.parse(slot);
  const parsed = playerNameSchema.safeParse(name);
  const parsedColor = playerColorSchema.safeParse(color);
  const error = !parsed.success ? "Escolha três letras de A a Z."
    : !parsedColor.success ? "Escolha uma cor disponível."
    : state.players[slot] ? "Este setor já está ocupado."
    : Object.values(state.players).some((player) => player.name === name)
      ? `O nome ${name} já está em uso. Escolha outras letras.`
      : Object.values(state.players).some((player) => player.color === color)
        ? "A cor escolhida já está em uso. Escolha outra cor." : "";
  if (error) return { ...state, errors: { ...state.errors, [slot]: error } };
  return {
    players: { ...state.players, [slot]: { name, color, attributes: initialPlayerAttributes() } },
    errors: { ...state.errors, [slot]: "" },
  };
}

export function leavePreparationPlayer(state: PreparationState, slot: number): PreparationState {
  slotSchema.parse(slot);
  const players = { ...state.players };
  delete players[slot];
  return { players, errors: { ...state.errors, [slot]: "" } };
}

export function changePreparationAttribute(
  state: PreparationState, slot: number, attribute: AttributeName, delta: 1 | -1,
): PreparationState {
  slotSchema.parse(slot);
  const player = state.players[slot];
  if (!player) return { ...state, errors: { ...state.errors, [slot]: "Não é possível editar um setor vazio." } };
  const proposed = playerAttributesSchema.safeParse({
    ...player.attributes, [attribute]: player.attributes[attribute] + delta,
  });
  if (!proposed.success) return {
    ...state,
    errors: { ...state.errors, [slot]: "Respeite os níveis de 1 a 3 e os três pontos disponíveis." },
  };
  return {
    players: { ...state.players, [slot]: {
      ...player, attributes: allocateAttributePoint(player.attributes, attribute, delta),
    } },
    errors: { ...state.errors, [slot]: "" },
  };
}
