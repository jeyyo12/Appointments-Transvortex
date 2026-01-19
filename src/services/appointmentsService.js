import { db } from '../firebaseConfig';
import { doc as docRef, getDoc } from 'firebase/firestore';

export async function getAppointmentById(appointmentId) {
  console.log('[Appointments Service] Fetching appointment:', appointmentId);
  const doc = await getDoc(docRef(db, 'appointments', appointmentId));
  if (!doc.exists()) {
    console.error('[Appointments Service] Appointment not found:', appointmentId);
    return null;
  }
  return { id: doc.id, ...doc.data() };
}