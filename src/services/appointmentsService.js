import { db } from '../firebase/firebase-init.js';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export async function getAppointmentById(id) {
  console.log('[AppointmentsService] Fetching appointment:', id);
  if (!id) throw new Error('appointmentId missing');
  const snap = await getDoc(doc(db, 'appointments', id));
  if (!snap.exists()) {
    console.warn('[AppointmentsService] Appointment not found:', id);
    return null;
  }
  const data = { id: snap.id, ...snap.data() };
  console.log('[AppointmentsService] Appointment fetched:', data);
  return data;
}