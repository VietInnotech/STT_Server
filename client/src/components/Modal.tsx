interface ModalProps {
  title?: string;
  message?: string;
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  showCancel?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  fullHeight?: boolean;
}

export default function Modal({
  title,
  message,
  open,
  isOpen,
  onClose,
  onConfirm,
  confirmLabel = "OK",
  showCancel = true,
  children,
  footer,
  maxWidth = "xl",
  fullHeight = false,
}: ModalProps) {
  const isModalOpen = open ?? isOpen ?? false;

  if (!isModalOpen) return null;

  const maxWidthClasses = {
    sm: "w-[40vw]",
    md: "w-[50vw]",
    lg: "w-[60vw]",
    xl: "w-[70vw]",
    "2xl": "w-[80vw]",
    full: "w-[95vw]",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative z-10 ${maxWidthClasses[maxWidth]} max-h-[80vh] bg-white rounded-lg shadow-lg flex flex-col`}
      >
        {/* Fixed Header */}
        {title && (
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children ? (
            children
          ) : (
            <>
              <div className="text-sm text-gray-700 mb-4">{message}</div>
              {!footer && (
                <div className="flex justify-end gap-2">
                  {showCancel && (
                    <button
                      onClick={onClose}
                      className="px-3 py-2 rounded bg-gray-100"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onConfirm?.();
                      onClose();
                    }}
                    className="px-3 py-2 rounded bg-blue-600 text-white"
                  >
                    {confirmLabel}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fixed Footer */}
        {footer && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
