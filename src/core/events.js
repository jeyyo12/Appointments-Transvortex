const boundContainers = new WeakSet();

export function bindActionDelegation(container, handler) {
  if (!container || boundContainers.has(container)) {
    return;
  }

  container.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action][data-id]');
    if (!target || !container.contains(target)) return;

    event.preventDefault();
    event.stopPropagation();

    handler({
      action: target.dataset.action,
      id: target.dataset.id,
      target,
      event
    });
  });

  boundContainers.add(container);
}
