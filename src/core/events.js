const boundContainers = new WeakSet();

export function bindActionDelegation(container, handler) {
  if (!container || boundContainers.has(container)) {
    return;
  }

  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action][data-id]');
    if (!target || !container.contains(target)) {
      // DEV: warn if an item-scoped data-action button is missing data-id
      const noId = event.target.closest('[data-action]:not([data-id])');
      if (noId && container.contains(noId)) {
        const action = noId.dataset.action;
        const ITEM_SCOPED = ['open','edit','delete','view','details','mark-paid','mark-unpaid','invoice','reschedule','complete','remove','pay'];
        if (ITEM_SCOPED.includes(action)) {
          console.warn('[Wiring] item-scoped action "' + action + '" fired with no data-id — click silently dropped.', noId.outerHTML.slice(0, 120));
        }
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // DEV tracer — set window.__tvDebug = true in console to enable
    if (window.__tvDebug) {
      console.debug('[Action]', target.dataset.action, '| id:', target.dataset.id, '|', target.outerHTML.slice(0, 80));
    }

    handler({
      action: target.dataset.action,
      id: target.dataset.id,
      target,
      event
    });
  });

  boundContainers.add(container);
}
