export function byId(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Required UI element #${id} is missing.`);
    return element;
}
export function query(selector, root = document) {
    const element = root.querySelector(selector);
    if (!element)
        throw new Error(`Required UI element ${selector} is missing.`);
    return element;
}
export function queryOptional(selector, root = document) {
    return root.querySelector(selector);
}
export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
export function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#96;');
}
export function formatDate(value) {
    if (!value)
        return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return String(value);
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}
export function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value))
        return '—';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}
export function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
export function debounce(callback, delayMs) {
    let handle;
    return (...args) => {
        if (handle !== undefined)
            window.clearTimeout(handle);
        handle = window.setTimeout(() => {
            handle = undefined;
            callback(...args);
        }, delayMs);
    };
}
export function createId(prefix) {
    const random = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
}
export function isTextEntryTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    return target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]');
}
export function setHtml(element, html) {
    element.innerHTML = html;
}
export function checked(value) {
    return value ? ' checked' : '';
}
export function selected(value, expected) {
    return value === expected ? ' selected' : '';
}
export function fieldRow(label, control, options = {}) {
    return `<div class="form-row${options.stacked ? ' stacked' : ''}"${options.title ? ` title="${escapeAttribute(options.title)}"` : ''}><label>${escapeHtml(label)}</label>${control}</div>`;
}
export function textControl(id, value, options = {}) {
    const attributes = [
        `id="${escapeAttribute(id)}"`,
        `class="${escapeAttribute(options.className || (options.type === 'number' ? 'number-control' : 'form-control'))}"`,
        `type="${escapeAttribute(options.type || 'text')}"`,
        `value="${escapeAttribute(value)}"`,
    ];
    if (options.placeholder)
        attributes.push(`placeholder="${escapeAttribute(options.placeholder)}"`);
    if (options.step !== undefined)
        attributes.push(`step="${escapeAttribute(options.step)}"`);
    if (options.min !== undefined)
        attributes.push(`min="${escapeAttribute(options.min)}"`);
    if (options.max !== undefined)
        attributes.push(`max="${escapeAttribute(options.max)}"`);
    return `<input ${attributes.join(' ')} />`;
}
export function selectControl(id, value, values) {
    return `<select id="${escapeAttribute(id)}" class="form-select">${values.map((entry) => {
        const option = typeof entry === 'string' ? { value: entry, label: entry } : entry;
        return `<option value="${escapeAttribute(option.value)}"${selected(value, option.value)}>${escapeHtml(option.label)}</option>`;
    }).join('')}</select>`;
}
export function closestData(target, attribute) {
    if (!(target instanceof Element))
        return null;
    return target.closest(`[${attribute}]`);
}
//# sourceMappingURL=dom.js.map