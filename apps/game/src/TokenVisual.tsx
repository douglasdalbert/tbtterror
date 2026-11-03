import { BASE_TOKEN_DIAMETER, PLAYER_COLORS, type PlayerColor } from "@terror/contracts";

export function tokenTextOutline(textColor: string) {
  return textColor === "#ffffff" ? "#11151d" : "#ffffff";
}

export function CalibrationToken({ name, color }: { name: string; color: PlayerColor }) {
  const tokenColor = PLAYER_COLORS.find(({ id }) => id === color);
  if (!tokenColor) throw new Error(`Cor de token desconhecida: ${color}`);
  return (
    <svg className="calibration-token" width={BASE_TOKEN_DIAMETER} height={BASE_TOKEN_DIAMETER}
      viewBox="0 0 40 40" role="img" aria-label={`Miniatura do token ${name} de 40 pixels CSS`}>
      <circle cx="20" cy="20" r="19" fill={tokenColor.hex} stroke={tokenColor.text} strokeWidth="1.5" />
      <text x="20" y="20" fill={tokenColor.text} stroke={tokenTextOutline(tokenColor.text)} strokeWidth="2"
        paintOrder="stroke" fontFamily="system-ui, sans-serif" fontSize="12" fontWeight="700"
        textAnchor="middle" dominantBaseline="central">{name}</text>
    </svg>
  );
}
