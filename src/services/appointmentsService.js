// ...existing code...

export async function getAppointmentById(id) {
  console.log('[appointmentsService] Fetching appointment:', id);
  // Your existing Firebase/data fetch logic
  const appointment = await yourDataSource.get(id);
  console.log('[appointmentsService] Appointment data:', appointment);
  return appointment;
}

// ...existing code...