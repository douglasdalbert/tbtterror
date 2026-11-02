import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { PLAYER_COLORS, type PlayerColor } from "@terror/contracts";
import { SectorDialog } from "./SectorDialog.js";
import { TouchButton } from "./TouchButton.js";

export function ColorPicker({ value, unavailable = [], title = "Cor do token", onChange }: {
  value: PlayerColor;
  unavailable?: readonly PlayerColor[];
  title?: string;
  onChange: (color: PlayerColor) => void;
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const selectedColor = PLAYER_COLORS.find(({ id }) => id === value);
  if (!selectedColor) throw new Error(`Cor de token desconhecida: ${value}`);

  return (
    <div ref={trigger} className="color-picker">
      <TouchButton className="color-picker-trigger" aria-label={`Escolher cor; atual: ${selectedColor.label}`}
        onPress={() => {
          const target = trigger.current?.closest<HTMLElement>(".sector-card");
          if (!target) throw new Error("O seletor de cor precisa estar dentro da área de um jogador.");
          setPortalTarget(target);
        }}>
        <span className="color-picker-swatch" style={{ backgroundColor: selectedColor.hex }} />
      </TouchButton>
      {portalTarget && createPortal(
        <SectorDialog title={title} onClose={() => setPortalTarget(null)}>
          <div className="color-palette" role="group" aria-label="Cores disponíveis">
            {PLAYER_COLORS.map(({ id, label, hex }) => (
              <TouchButton key={id} className="color-option" aria-label={label}
                aria-pressed={id === value} disabled={unavailable.includes(id)}
                onPress={() => {
                  onChange(id);
                  setPortalTarget(null);
                }}>
                <span className="color-picker-swatch" style={{ backgroundColor: hex }} />
              </TouchButton>
            ))}
          </div>
        </SectorDialog>,
        portalTarget,
      )}
    </div>
  );
}
