const TEMPLATE_URL = '/src/features/invoice/invoiceTemplate.html';

function fillTemplate(html, model, logo) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html.trim();
  const root = wrapper.querySelector('.invoice');
  if (logo) root.querySelector('.invoice__logo').src = logo;
  root.querySelector('.invoice__company-name').textContent = model.company.name;
  root.querySelector('.invoice__company-website').textContent = model.company.website;
  root.querySelector('.invoice__company-email').textContent = model.company.email;

  root.querySelector('.invoice__number').textContent = model.invoice.number;
  root.querySelector('.invoice__date').textContent = model.invoice.date;

  root.querySelector('.invoice__customer-name').textContent = model.customer.name || '-';
  root.querySelector('.invoice__customer-vehicle').textContent = model.customer.vehicle || '-';
  root.querySelector('.invoice__customer-mileage').textContent = model.customer.mileage || '-';
  root.querySelector('.invoice__customer-address').textContent = model.customer.address || '-';

  const tbody = root.querySelector('.invoice__services-body');
  tbody.innerHTML = '';
  if (model.services.length) {
    model.services.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.description}</td>
        <td class="is-right">${s.qty}</td>
        <td class="is-right">${model.format(s.unitPrice)}</td>
        <td class="is-right">${model.format(s.lineTotal)}</td>`;
      tbody.appendChild(tr);
    });
  } else {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="is-muted">${model.notes || 'No services listed.'}</td>`;
    tbody.appendChild(tr);
  }

  root.querySelector('.invoice__subtotal').textContent = model.format(model.totals.subtotal);
  root.querySelector('.invoice__vat').textContent = `${(model.totals.vatRate * 100).toFixed(0)}% (${model.format(model.totals.vatAmount)})`;
  root.querySelector('.invoice__total').textContent = model.format(model.totals.total);
  root.querySelector('.invoice__notes').textContent = model.notes || '';

  return root;
}

function ensureModalContainer() {
  let host = document.getElementById('invoice-preview-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'invoice-preview-host';
    document.body.appendChild(host);
  }
  return host;
}

export async function openPreview(model, logoDataUrl, onDownload) {
  const html = await fetch(TEMPLATE_URL).then((r) => r.text());
  const content = fillTemplate(html, model, logoDataUrl);
  const host = ensureModalContainer();
  host.innerHTML = `
    <div class="invoice-preview-backdrop" role="dialog">
      <div class="invoice-preview-modal">
        <button class="invoice-preview-close" aria-label="Close">×</button>
        <div class="invoice-preview-body"></div>
        <div class="invoice-preview-actions">
          <button class="invoice-preview-download">Download PDF</button>
        </div>
      </div>
    </div>`;
  host.querySelector('.invoice-preview-body').appendChild(content);
  host.querySelector('.invoice-preview-close').onclick = () => (host.innerHTML = '');
  host.querySelector('.invoice-preview-download').onclick = onDownload;
}
