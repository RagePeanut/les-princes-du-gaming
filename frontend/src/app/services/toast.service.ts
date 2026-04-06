import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
  retry?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly autoDismissMs = 5000;

  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'info', retry?: () => void): void {
    const id = this.nextId++;
    const toast: Toast = { id, message, type, retry };
    this.toasts.update((t) => [...t, toast]);

    setTimeout(() => this.dismiss(id), this.autoDismissMs);
  }

  error(message: string, retry?: () => void): void {
    this.show(message, 'error', retry);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((toast) => toast.id !== id));
  }
}
