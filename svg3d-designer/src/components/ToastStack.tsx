import { useEffect } from "react";
import { useToastStore, type ToastMessage } from "../state/toastStore";

const TOAST_DURATION_MS = 2600;

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.sticky) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id, toast.sticky]);

  return (
    <button
      type="button"
      className={"toast" + (toast.tone === "warning" ? " toast-warning" : "") + (toast.sticky ? " toast-sticky" : "")}
      onClick={() => onDismiss(toast.id)}
      title="Dismiss"
    >
      {toast.text}
    </button>
  );
}
