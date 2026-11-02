import { z } from "zod";

export const PLAYER_COLOR_IDS = [
  "red", "orange", "amber", "chartreuse", "lime", "green", "spring", "teal",
  "cyan", "azure", "blue", "indigo", "violet", "purple", "magenta", "rose",
] as const;

export const playerColorSchema = z.enum(PLAYER_COLOR_IDS);
export type PlayerColor = z.infer<typeof playerColorSchema>;

export const PLAYER_COLORS = [
  { id: "red", label: "Vermelho", hex: "#b80909", text: "#f8fafc" },
  { id: "orange", label: "Laranja", hex: "#b84b09", text: "#f8fafc" },
  { id: "amber", label: "Âmbar", hex: "#b88c09", text: "#11151d" },
  { id: "chartreuse", label: "Amarelo-lima", hex: "#a2b809", text: "#11151d" },
  { id: "lime", label: "Lima", hex: "#60b809", text: "#11151d" },
  { id: "green", label: "Verde", hex: "#1fb809", text: "#11151d" },
  { id: "spring", label: "Verde-claro", hex: "#09b835", text: "#11151d" },
  { id: "teal", label: "Verde-esmeralda", hex: "#09b876", text: "#11151d" },
  { id: "cyan", label: "Turquesa", hex: "#09b8b8", text: "#11151d" },
  { id: "azure", label: "Azul-celeste", hex: "#0976b8", text: "#f8fafc" },
  { id: "blue", label: "Azul", hex: "#0935b8", text: "#f8fafc" },
  { id: "indigo", label: "Anil", hex: "#1f09b8", text: "#f8fafc" },
  { id: "violet", label: "Violeta", hex: "#6009b8", text: "#f8fafc" },
  { id: "purple", label: "Roxo", hex: "#a209b8", text: "#f8fafc" },
  { id: "magenta", label: "Magenta", hex: "#b8098c", text: "#f8fafc" },
  { id: "rose", label: "Rosa", hex: "#b8094b", text: "#f8fafc" },
] as const satisfies readonly {
  id: PlayerColor;
  label: string;
  hex: string;
  text: string;
}[];
