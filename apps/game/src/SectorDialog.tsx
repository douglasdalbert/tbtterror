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
          event.stopPropagation();
          onClose();
        }
        if (event.key !== "Tab") return;
        event.stopPropagation();
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
        <TouchButton aria-label="Fechar" onPress={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </TouchButton>
      </header>
      <div className="sector-dialog-content">{children}</div>
    </div>
  );
}
