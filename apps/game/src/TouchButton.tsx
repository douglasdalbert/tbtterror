import { useRef, type ButtonHTMLAttributes } from "react";

type TouchButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onPress: () => void;
  alert?: boolean;
};

export function TouchButton({ onPress, disabled, children, alert = false, className, ...props }: TouchButtonProps) {
  const activePointer = useRef<number | null>(null);
  const mousePressed = useRef(false);

  return (
    <button
      {...props}
      className={["touch-button", className].filter(Boolean).join(" ")}
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        mousePressed.current = event.pointerType === "mouse" && event.button === 0;
        if (disabled || event.button !== 0 || event.pointerType === "mouse"
          || activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!disabled && event.clientX >= bounds.left && event.clientX <= bounds.right
          && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
          onPress();
        }
      }}
      onPointerCancel={(event) => {
        if (activePointer.current === event.pointerId) activePointer.current = null;
        mousePressed.current = false;
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") mousePressed.current = false;
      }}
      onLostPointerCapture={(event) => {
        if (activePointer.current === event.pointerId) activePointer.current = null;
      }}
      onClick={(event) => {
        // Ignore touch clicks retargeted from a gesture that started on another control.
        const activate = event.detail === 0 || mousePressed.current;
        mousePressed.current = false;
        if (activate) onPress();
      }}
    >
      {children}
      {alert && <span className="button-alert" aria-hidden="true" />}
    </button>
  );
}
