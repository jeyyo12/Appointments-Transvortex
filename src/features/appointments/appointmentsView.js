// Invoice button rendering and click handling updated to use global handler
// Removes old dependency on invoiceController.js

function renderAppointmentCard(appointment) {
  return `
    <div class="appointment-card">
      <!-- ...existing card markup... -->
      <button class="apt-btn apt-btn-invoice" data-apt-id="${appointment.id}">Invoice</button>
      <!-- ...existing card markup... -->
    </div>
  `;
}