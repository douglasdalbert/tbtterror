import { DOOR_ACTION_RULES, type ActiveDoorAction, type DoorActionOption, type MatchCommand } from "@terror/contracts";
import type { CSSProperties } from "react";
import { AttributeIcon, ClockIcon } from "./Icons.js";
import { TouchButton } from "./TouchButton.js";

export function DoorActions({ options, active, simulationTurns, strength, dexterity, paused, disabled, onCommand }: {
  options: DoorActionOption[];
  active: ActiveDoorAction | undefined;
  simulationTurns: number;
  strength: number;
  dexterity: number;
  paused: boolean;
  disabled: boolean;
  onCommand: (command: MatchCommand) => void;
}) {
  return <div className="door-actions" aria-label="Ações de portas e janelas">
    {options.filter((option) => option.action !== "jump-window" || dexterity >= DOOR_ACTION_RULES["jump-window"].dexterity).map((option) => {
      const rule = DOOR_ACTION_RULES[option.action];
      const selected = active?.action === option.action && active.q === option.q && active.r === option.r
        && active.direction === option.direction;
      const progress = selected ? Math.min(1, (simulationTurns - active.startedTurn) / rule.durationTurns) : 0;
      return <TouchButton key={`${option.q},${option.r},${option.direction},${option.action}`}
        className="door-action" disabled={disabled || !option.available || strength < rule.strength || dexterity < rule.dexterity || (!!active && !selected) || (paused && !selected)}
        aria-label={`${rule.label}; ${rule.durationTurns} ${rule.durationTurns === 1 ? "turno" : "turnos"}${rule.strength > 1 ? `; força ${rule.strength}` : ""}${rule.dexterity > 1 ? `; destreza ${rule.dexterity}` : ""}${!option.available ? "; sem caminho transitável do outro lado" : ""}; mantenha pressionado`}
        style={{ "--action-progress": `${progress * 100}%` } as CSSProperties}
        onHoldChange={(holding) => onCommand(holding
          ? { type: "door-action", slot: option.slot, target: { q: option.q, r: option.r, direction: option.direction }, action: option.action }
          : { type: "cancel-door-action", slot: option.slot,
            target: { q: option.q, r: option.r, direction: option.direction }, action: option.action })}>
        <span>{rule.label}</span>
        <span className="action-cost" aria-hidden="true"><ClockIcon />{rule.durationTurns}</span>
        {rule.strength > 1 && <span className="action-cost" aria-hidden="true"><AttributeIcon attribute="strength" />{rule.strength}</span>}
        {rule.dexterity > 1 && <span className="action-cost" aria-hidden="true"><AttributeIcon attribute="dexterity" />{rule.dexterity}</span>}
        {selected && <span className="sr-only" role="progressbar" aria-label={`Progresso: ${rule.label}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress * 100)} />}
      </TouchButton>;
    })}
  </div>;
}
