import { create } from "zustand";

export interface ToastMessage {
  id: number;
  text: string;
}

interface ToastState {
  toasts: ToastMessage[];
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget confirmation for a major action — a separate store (not
 * undo-tracked, not persisted) so it can be called as a plain side effect
 * from anywhere, including inside scene-store reducers. */
export function showToast(text: string) {
  const id = nextId++;
  useToastStore.setState((state) => ({ toasts: [...state.toasts, { id, text }] }));
}
