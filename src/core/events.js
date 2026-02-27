const boundContainers = new WeakSet();

export function bindActionDelegation(container, handler) {
  if (!container || boundContainers.has(container)) {
    return;
  }

  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !container.contains(target)) {
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id || null;
    const ITEM_SCOPED = ['open','edit','delete','view','details','mark-paid','mark-unpaid','invoice','reschedule','complete','remove','pay'];

    if (ITEM_SCOPED.includes(action) && !id) {
      console.warn('[Wiring] item-scoped action "' + action + '" fired with no data-id — click silently dropped.', target.outerHTML.slice(0, 120));
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // DEV tracer — set window.__tvDebug = true in console to enable
    if (window.__tvDebug) {
      console.debug('[Action]', action, '| id:', id, '|', target.outerHTML.slice(0, 80));
    }

    handler({
      action,
      id,
      target,
      event
    });
  });

  boundContainers.add(container);
}
