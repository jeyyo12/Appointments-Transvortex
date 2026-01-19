import { downloadInvoicePDF } from '../invoice/invoiceController.js';

function renderAppointmentCard(appointment) {
  return `
    <div class="appointment-card">
      <!-- ...existing card markup... -->
      <button class="btn-invoice" data-apt-id="${appointment.id}">Invoice</button>
      <!-- ...existing card markup... -->
    </div>
  `;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-invoice');
  if (!btn) return;
  const id = btn.dataset.aptId;
  if (id) downloadInvoicePDF(id);
});