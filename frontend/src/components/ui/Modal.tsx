import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Ignored while a request is in flight, so a click cannot cancel a half-done action. */
  onClose: () => void;
  closeDisabled?: boolean;
  children?: ReactNode;
  footer: ReactNode;
};

export default function Modal({
  open,
  title,
  description,
  icon,
  onClose,
  closeDisabled = false,
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    // Stop the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  /**
   * Rendered into <body> rather than in place. An ancestor with a filter, backdrop-filter
   * or transform becomes the containing block for `position: fixed` descendants — so a
   * dialog rendered inside the blurred sticky header would anchor to the header instead
   * of the viewport, and its overlay would cover only that strip.
   */
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon ? <div className="icon-tile h-9 w-9">{icon}</div> : null}
            <div>
              <h2 className="text-base font-semibold tracking-tight text-theme-text">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm text-theme-muted">{description}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="icon-button -mt-1 -mr-1"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children ? <div className="mb-6 flex flex-col gap-3">{children}</div> : null}

        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
