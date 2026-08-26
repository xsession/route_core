export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required UI element #${id} is missing.`);
  return element as T;
}

export function query<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required UI element ${selector} is missing.`);
  return element as T;
}

export function queryOptional<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector(selector) as T | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function debounce<TArgs extends unknown[]>(callback: (...args: TArgs) => void, delayMs: number): (...args: TArgs) => void {
  let handle: number | undefined;
  return (...args: TArgs) => {
    if (handle !== undefined) window.clearTimeout(handle);
    handle = window.setTimeout(() => {
      handle = undefined;
      callback(...args);
    }, delayMs);
  };
}

export function createId(prefix: string): string {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]');
}

export function setHtml(element: Element, html: string): void {
  element.innerHTML = html;
}

export function checked(value: boolean): string {
  return value ? ' checked' : '';
}

export function selected(value: unknown, expected: unknown): string {
  return value === expected ? ' selected' : '';
}

export function fieldRow(label: string, control: string, options: { stacked?: boolean; title?: string } = {}): string {
  return `<div class="form-row${options.stacked ? ' stacked' : ''}"${options.title ? ` title="${escapeAttribute(options.title)}"` : ''}><label>${escapeHtml(label)}</label>${control}</div>`;
}

export function textControl(id: string, value: unknown, options: { type?: string; placeholder?: string; step?: string | number; min?: string | number; max?: string | number; className?: string } = {}): string {
  const attributes = [
    `id="${escapeAttribute(id)}"`,
    `class="${escapeAttribute(options.className || (options.type === 'number' ? 'number-control' : 'form-control'))}"`,
    `type="${escapeAttribute(options.type || 'text')}"`,
    `value="${escapeAttribute(value)}"`,
  ];
  if (options.placeholder) attributes.push(`placeholder="${escapeAttribute(options.placeholder)}"`);
  if (options.step !== undefined) attributes.push(`step="${escapeAttribute(options.step)}"`);
  if (options.min !== undefined) attributes.push(`min="${escapeAttribute(options.min)}"`);
  if (options.max !== undefined) attributes.push(`max="${escapeAttribute(options.max)}"`);
  return `<input ${attributes.join(' ')} />`;
}

export function selectControl(id: string, value: unknown, values: Array<string | { value: string; label: string }>): string {
  return `<select id="${escapeAttribute(id)}" class="form-select">${values.map((entry) => {
    const option = typeof entry === 'string' ? { value: entry, label: entry } : entry;
    return `<option value="${escapeAttribute(option.value)}"${selected(value, option.value)}>${escapeHtml(option.label)}</option>`;
  }).join('')}</select>`;
}

export function closestData(target: EventTarget | null, attribute: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[${attribute}]`);
}
