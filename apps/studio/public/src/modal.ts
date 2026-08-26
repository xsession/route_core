import { byId, escapeHtml } from './dom.js';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ModalContext<T> {
  root: HTMLElement;
  body: HTMLElement;
  close(value?: T): void;
  setBusy(busy: boolean, label?: string): void;
  setError(message: string | null): void;
}

export interface ModalOptions<T> {
  title: string;
  subtitle?: string;
  body: string | HTMLElement;
  size?: 'small' | 'normal' | 'large';
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideFooter?: boolean;
  dismissible?: boolean;
  onMount?(context: ModalContext<T>): void | Promise<void>;
  onConfirm?(context: ModalContext<T>): T | false | void | Promise<T | false | void>;
}

export function toast(title: string, message = '', kind: ToastKind = 'info', durationMs = 3800): void {
  const root = byId('toast-root');
  const element = document.createElement('div');
  element.className = `toast ${kind === 'info' ? '' : kind}`;
  element.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div>${message ? `<div>${escapeHtml(message)}</div>` : ''}`;
  root.append(element);
  const remove = () => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(6px)';
    window.setTimeout(() => element.remove(), 160);
  };
  element.addEventListener('click', remove, { once: true });
  window.setTimeout(remove, durationMs);
}

export class ModalManager {
  private readonly root = byId('modal-root');
  private activeBackdrop: HTMLElement | null = null;

  public open<T = void>(options: ModalOptions<T>): Promise<T | undefined> {
    this.close();
    return new Promise<T | undefined>((resolve) => {
      let settled = false;
      const dismissible = options.dismissible !== false;
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const sizeClass = options.size === 'large' ? ' large' : options.size === 'small' ? ' small' : '';
      backdrop.innerHTML = `
        <section class="modal${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="active-modal-title">
          <header class="modal-header">
            <div>
              <div id="active-modal-title" class="modal-title">${escapeHtml(options.title)}</div>
              ${options.subtitle ? `<div class="modal-subtitle">${escapeHtml(options.subtitle)}</div>` : ''}
            </div>
            <button class="modal-close" data-modal-close aria-label="Close">×</button>
          </header>
          <div class="modal-body"></div>
          <div class="modal-error" hidden></div>
          ${options.hideFooter ? '' : `<footer class="modal-footer"><button class="secondary-button" data-modal-cancel>${escapeHtml(options.cancelLabel || 'Cancel')}</button><button class="${options.destructive ? 'danger-button' : 'primary-button'}" data-modal-confirm>${escapeHtml(options.confirmLabel || 'Apply')}</button></footer>`}
        </section>`;
      this.root.append(backdrop);
      this.activeBackdrop = backdrop;
      const body = backdrop.querySelector<HTMLElement>('.modal-body')!;
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else body.append(options.body);
      const modal = backdrop.querySelector<HTMLElement>('.modal')!;
      const close = (value?: T) => {
        if (settled) return;
        settled = true;
        backdrop.remove();
        if (this.activeBackdrop === backdrop) this.activeBackdrop = null;
        document.removeEventListener('keydown', onKeyDown, true);
        resolve(value);
      };
      const context: ModalContext<T> = {
        root: modal,
        body,
        close,
        setBusy: (busy, label) => {
          const confirm = backdrop.querySelector<HTMLButtonElement>('[data-modal-confirm]');
          const cancel = backdrop.querySelector<HTMLButtonElement>('[data-modal-cancel]');
          if (confirm) {
            confirm.disabled = busy;
            if (label) confirm.textContent = label;
          }
          if (cancel) cancel.disabled = busy;
          modal.dataset.busy = busy ? 'true' : 'false';
        },
        setError: (message) => {
          const error = backdrop.querySelector<HTMLElement>('.modal-error')!;
          error.hidden = !message;
          error.textContent = message || '';
        },
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && dismissible) {
          event.preventDefault();
          close();
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !options.hideFooter) {
          event.preventDefault();
          void confirm();
        }
      };
      const confirm = async () => {
        context.setError(null);
        try {
          context.setBusy(true, 'Working…');
          const value = await options.onConfirm?.(context);
          context.setBusy(false, options.confirmLabel || 'Apply');
          if (value === false) return;
          close(value as T | undefined);
        } catch (error) {
          context.setBusy(false, options.confirmLabel || 'Apply');
          context.setError(error instanceof Error ? error.message : String(error));
        }
      };
      backdrop.querySelector('[data-modal-close]')?.addEventListener('click', () => dismissible && close());
      backdrop.querySelector('[data-modal-cancel]')?.addEventListener('click', () => close());
      backdrop.querySelector('[data-modal-confirm]')?.addEventListener('click', () => void confirm());
      backdrop.addEventListener('pointerdown', (event) => {
        if (event.target === backdrop && dismissible) close();
      });
      document.addEventListener('keydown', onKeyDown, true);
      queueMicrotask(() => {
        const focusTarget = body.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
          || backdrop.querySelector<HTMLElement>('[data-modal-confirm]');
        focusTarget?.focus();
        void options.onMount?.(context);
      });
    });
  }

  public close(): void {
    if (!this.activeBackdrop) return;
    const closeButton = this.activeBackdrop.querySelector<HTMLElement>('[data-modal-close]');
    closeButton?.click();
  }
}
