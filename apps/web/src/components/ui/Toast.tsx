'use client'

interface ToastProps {
  message: string
}

export function Toast({ message }: ToastProps) {
  return (
    <div className="toast">
      <span className="dot" />
      {message}
    </div>
  )
}
