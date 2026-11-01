import { useEffect, useId, useRef, type ReactNode } from "react";
import { TouchButton } from "./TouchButton.js";

export function SectorDialog({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div ref={dialog} className="sector-dialog" role="dialog" aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key !== "Tab") return;
        const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [tabindex="0"]',
        ));
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}>
      <header className="sector-dialog-heading">
        <strong id={titleId}>{title}</strong>
        <TouchButton aria-label="Fechar" onPress={onClose}>×</TouchButton>
      </header>
      <div className="sector-dialog-content">{children}</div>
    </div>
  );
}
