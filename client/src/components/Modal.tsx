interface ModalProps {
  title?: string
  message?: string
  open?: boolean
  isOpen?: boolean
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  showCancel?: boolean
  children?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  fullHeight?: boolean
}

export default function Modal({
  title,
  message,
  open,
  isOpen,
  onClose,
  onConfirm,
  confirmLabel = 'OK',
  showCancel = true,
  children,
  maxWidth = 'xl',
  fullHeight = false
}: ModalProps) {
  const isModalOpen = open ?? isOpen ?? false

  if (!isModalOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-[40%] max-h-[40%]',
    md: 'max-w-[50%] max-h-[50%]',
    lg: 'max-w-[60%] max-h-[60%]',
    xl: 'max-w-[70%] max-h-[70%]',
    '2xl': 'max-w-[80%] max-h-[80%]',
    full: 'max-w-full max-h-full',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-50 size-svw" onClick={onClose} />
      <div
        className={`relative z-10 size-full ${maxWidthClasses[maxWidth]} bg-white rounded-lg shadow-lg p-6 ${fullHeight ? 'h-[calc(100vh-5rem)] overflow-auto flex flex-col' : ''
          }`}
      >
        {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}

        {children ? (
          children
        ) : (
          <>
            <div className="text-sm text-gray-700 mb-4">{message}</div>
            <div className="flex justify-end gap-2">
              {showCancel && (
                <button onClick={onClose} className="px-3 py-2 rounded bg-gray-100">Cancel</button>
              )}
              <button onClick={() => { onConfirm?.(); onClose() }} className="px-3 py-2 rounded bg-blue-600 text-white">{confirmLabel}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
