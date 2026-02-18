// Replacement for renderScannedInvoiceReviewItems warning display
function renderScannedInvoiceReviewItems() {
    const container = document.getElementById('scanReviewItemsList');
    if (!container || !scannedInvoiceReviewState?.extracted) return;

    const items = scannedInvoiceReviewState.extracted.items || [];
    const warningEl = document.getElementById('scanReviewItemsWarning');
    if (items.length === 0) {
        container.innerHTML = '<div class="scanReviewItemsEmpty">No items detected yet.</div>';
        if (warningEl) warningEl.style.display = 'block';
        return;
    }
    if (warningEl) warningEl.style.display = 'none';

    container.innerHTML = items.map((item, index) => `
        <div class="scanReviewItemRow" data-item-index="${index}">
            <input type="text" class="scanReviewItemInput" data-item-field="description" value="${escapeHtml(item.description || '')}" placeholder="Description" ${isAccountant ? 'disabled' : ''} />
            <input type="number" class="scanReviewItemInput" data-item-field="qty" step="0.01" value="${item.qty ?? ''}" placeholder="Qty" ${isAccountant ? 'disabled' : ''} />
            <input type="number" class="scanReviewItemInput" data-item-field="unitPrice" step="0.01" value="${item.unitPrice ?? ''}" placeholder="Unit" ${isAccountant ? 'disabled' : ''} />
            <input type="number" class="scanReviewItemInput" data-item-field="lineTotal" step="0.01" value="${item.lineTotal ?? ''}" placeholder="Line total" ${isAccountant ? 'disabled' : ''} />
            <button type="button" class="scanReviewItemRemove" data-item-remove="${index}" ${isAccountant ? 'disabled' : ''}>Remove</button>
        </div>
    `).join('');

    // Attach event listeners for item removal
    const modal = document.getElementById('scanReviewModal');
    if (modal) {
        const removeButtons = modal.querySelectorAll('.scanReviewItemRemove');
        removeButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const idx = Number(e.target.dataset.itemRemove);
                if (Number.isInteger(idx)) removeScannedInvoiceReviewItem(idx);
            });
        });
    }
}
