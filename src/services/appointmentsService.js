// ...existing code...

/**
 * Get appointment by ID
 */
export async function getAppointmentById(appointmentId) {
  console.log('[Appointments Service] Fetching appointment:', appointmentId);
  
  // If using Firebase
  if (typeof db !== 'undefined') {
    const docRef = doc(db, 'appointments', appointmentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  }
  
  // If using localStorage
  const stored = localStorage.getItem('appointments');
  if (!stored) return null;
  
  const appointments = JSON.parse(stored);
  return appointments.find(apt => apt.id === appointmentId) || null;
}

// ...existing code...