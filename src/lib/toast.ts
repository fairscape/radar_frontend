/** Global toast queue. ``useToasts`` renders it; ``toast.*`` pushes to it. */
import { useSyncExternalStore } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function push(kind: ToastKind, text: string, action?: Toast['action'], ttl = 6000) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, text, action }];
  emit();
  window.setTimeout(() => dismissToast(id), ttl);
  return id;
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  info: (text: string, action?: Toast['action']) => push('info', text, action),
  success: (text: string, action?: Toast['action']) => push('success', text, action),
  error: (text: string, action?: Toast['action']) => push('error', text, action, 10000),
};

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}
