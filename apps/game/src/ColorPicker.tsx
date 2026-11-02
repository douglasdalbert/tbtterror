import { useState } from "react";
import { PLAYER_COLORS, type PlayerColor } from "@terror/contracts";
import { SectorDialog } from "./SectorDialog.js";
import { TouchButton } from "./TouchButton.js";

export function ColorPicker({ value, unavailable = [], title = "Cor do token", onChange }: {
  value: PlayerColor;
  unavailable?: readonly PlayerColor[];
  title?: string;
  onChange: (color: PlayerColor) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedColor = PLAYER_COLORS.find(({ id }) => id === value);
  if (!selectedColor) throw new Error(`Cor de token desconhecida: ${value}`);

  return (
    <>
      <TouchButton className="color-picker-trigger" aria-label={`Escolher cor; atual: ${selectedColor.label}`}
        onPress={() => setOpen(true)}>
        <span className="color-picker-swatch" style={{ backgroundColor: selectedColor.hex }} />
      </TouchButton>
      {open && (
        <SectorDialog title={title} onClose={() => setOpen(false)}>
          <div className="color-palette" role="group" aria-label="Cores disponíveis">
            {PLAYER_COLORS.map(({ id, label, hex }) => (
              <TouchButton key={id} className="color-option" aria-label={label}
                aria-pressed={id === value} disabled={unavailable.includes(id)}
                onPress={() => {
                  onChange(id);
                  setOpen(false);
                }}>
                <span className="color-picker-swatch" style={{ backgroundColor: hex }} />
              </TouchButton>
            ))}
          </div>
        </SectorDialog>
      )}
    </>
  );
}
