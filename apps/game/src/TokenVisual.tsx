import type { AttributeName, Attributes } from "@terror/contracts";

export const tokenMarkerShapes: Record<AttributeName, { body: string; details: string; activeExtras: string }> = {
  strength: {
    body: "M13 43V35a10 10 0 0 1 20 0v-9a10 10 0 0 1 20 0 10 10 0 0 1 20 0v10h8a10 10 0 0 1 10 10v7a39 39 0 0 1-78 0Z",
    details: "M13 43v-8m0 8a10 10 0 0 0 20 0V26m0 17a10 10 0 0 0 20 0V26m20 10H56a10 10 0 0 0 0 20h12q-16 0-16 16",
    activeExtras: "",
  },
  dexterity: {
    body: "M13 24 34 5Q37 2 40 7L51 22Q55 27 61 29Q70 34 66 45L55 64Q52 70 50 81Q46 93 33 95L18 96Q12 98 9 94Q3 95 4 89Q0 85 4 80Q6 77 13 77L21 75Q25 73 25 66Q27 44 13 24Z",
    details: "",
    activeExtras: "M47 11 97 17 57 21ZM66 25 98 31 72 35ZM73 41 98 46 70 51ZM65 57 98 63 60 67ZM57 73 97 79 54 84ZM48 89 95 94 41 98Z",
  },
  wisdom: {
    body: "M42 80Q39 80 38 75Q37 67 32 61A24 24 0 1 1 68 61Q63 67 62 75Q61 80 58 80ZM39 85H61V90Q61 95 56 96V98H44V96Q39 95 39 90Z",
    details: "M35 48Q35 33 50 33",
    activeExtras: "M50 3V13M18 16 25 23M4 48H14M18 80 25 73M82 16 75 23M96 48H86M82 80 75 73",
  },
};

export function tokenMarkerPositions() {
  const attributes: AttributeName[] = ["strength", "dexterity", "wisdom"];
  return attributes.flatMap((attribute, group) => [0, 1, 2].map((index) => {
    const angle = (-150 + group * 120 + index * 24) * Math.PI / 180;
    return { attribute, index, x: 32 + 25 * Math.cos(angle), y: 32 + 25 * Math.sin(angle) };
  }));
}

export function TokenMarker({ attribute, used = false }: { attribute: AttributeName; used?: boolean }) {
  const { body, details, activeExtras } = tokenMarkerShapes[attribute];
  return (
    <svg viewBox="0 0 100 100" width="100" height="100" fill="none" stroke="#75d9f4" strokeWidth="4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={body} fill={used ? "#75d9f4" : "none"} />
      {details && (used || attribute === "strength") &&
        <path d={details} stroke={used ? "#192d3d" : "#75d9f4"} />}
      {used && activeExtras && <path d={activeExtras} fill={attribute === "dexterity" ? "#75d9f4" : "none"} />}
    </svg>
  );
}

export function CalibrationToken({ name, attributes }: {
  name: string;
  attributes: Attributes;
}) {
  return (
    <svg className="calibration-token" width="64" height="64"
      viewBox="0 0 64 64" role="img"
      aria-label={`Miniatura do token ${name} de 64 pixels CSS; força ${attributes.strength}, destreza ${attributes.dexterity}, inteligência ${attributes.wisdom}; nenhum atributo em uso`}>
      <circle cx="32" cy="32" r="31" fill="#192d3d" stroke="#91a9bc" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="15" fill="#1678cf" />
      {tokenMarkerPositions().map(({ attribute, index, x, y }) => (
        <g key={`${attribute}-${index}`} transform={`translate(${x - 4.25} ${y - 4.25}) scale(.085)`}>
          <TokenMarker attribute={attribute} />
        </g>
      ))}
      <text x="32" y="32" fill="#e6edf3" fontFamily="system-ui, sans-serif"
        fontSize="8" fontWeight="700" textAnchor="middle" dominantBaseline="central">{name}</text>
    </svg>
  );
}
