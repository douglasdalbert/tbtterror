import { z } from "zod";

export const PLAYER_COLOR_IDS = [
  "red", "blue", "green", "yellow", "purple", "pink", "black", "gray",
  "white", "orange", "brown", "dark-green", "dark-blue",
] as const;

export const playerColorSchema = z.enum(PLAYER_COLOR_IDS);
export type PlayerColor = z.infer<typeof playerColorSchema>;

export const PLAYER_COLORS = [
  { id: "red", label: "Vermelho", hex: "#dc2626", text: "#ffffff" },
  { id: "blue", label: "Azul", hex: "#2563eb", text: "#ffffff" },
  { id: "green", label: "Verde", hex: "#15803d", text: "#ffffff" },
  { id: "yellow", label: "Amarelo", hex: "#facc15", text: "#11151d" },
  { id: "purple", label: "Roxo", hex: "#7e22ce", text: "#ffffff" },
  { id: "pink", label: "Rosa", hex: "#be185d", text: "#ffffff" },
  { id: "black", label: "Preto", hex: "#111827", text: "#ffffff" },
  { id: "gray", label: "Cinza", hex: "#6b7280", text: "#ffffff" },
  { id: "white", label: "Branco", hex: "#f9fafb", text: "#11151d" },
  { id: "orange", label: "Laranja", hex: "#c2410c", text: "#ffffff" },
  { id: "brown", label: "Marrom", hex: "#854d0e", text: "#ffffff" },
  { id: "dark-green", label: "Verde escuro", hex: "#14532d", text: "#ffffff" },
  { id: "dark-blue", label: "Azul escuro", hex: "#1e3a8a", text: "#ffffff" },
] as const satisfies readonly {
  id: PlayerColor;
  label: string;
  hex: string;
  text: string;
}[];
