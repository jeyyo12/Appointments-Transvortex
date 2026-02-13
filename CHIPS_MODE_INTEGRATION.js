#!/usr/bin/env node
/**
 * CHIPS MODE - Integration Guide for Form Submission
 * 
 * This file shows how to integrate Chips Mode data into your appointment form
 * submission and totals calculation.
 * 
 * Quick Start:
 * 1. Import getChipsData() and updateTotals() 
 * 2. Call getChipsData() when submitting the form
 * 3. Format data as needed for your backend
 */

// ============================================================
// STEP 1: Import Chips Mode Functions
// ============================================================

import { getChipsData } from './src/core/chips-mode.js';

// ============================================================
// STEP 2: Get Chips Data Before Form Submission
// ============================================================

function prepareAppointmentData() {
  // Get all form data
  const { jobs, parts } = getChipsData();
  
  // Your other form data
  const appointmentData = {
    // Client info
    client: {
      name: document.getElementById('clientName')?.value,
      email: document.getElementById('clientEmail')?.value,
      phone: document.getElementById('clientPhone')?.value,
      address: document.getElementById('address')?.value
    },
    
    // Vehicle info
    vehicle: {
      make: document.getElementById('vehicleMake')?.value,
      model: document.getElementById('vehicleModel')?.value,
      regPlate: document.getElementById('regPlate')?.value,
      mileage: document.getElementById('mileage')?.value
    },
    
    // Services (from Chips Mode)
    services: jobs,  // Array of { name, qty, price }
    
    // Parts (from Chips Mode)
    parts: parts,    // Array of { name, qty, price }
    
    // Notes
    notes: document.getElementById('notes')?.value,
    
    // Totals (can be recalculated or taken from display)
    totals: calculateTotals(jobs, parts),
    
    // Metadata
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  
  return appointmentData;
}

// ============================================================
// STEP 3: Calculate Totals from Chips Data
// ============================================================

function calculateTotals(jobs, parts) {
  // Labour subtotal (jobs)
  const labourSubtotal = jobs.reduce((sum, job) => {
    return sum + (job.qty * job.price);
  }, 0);
  
  // Parts subtotal
  const partsSubtotal = parts.reduce((sum, part) => {
    return sum + (part.qty * part.price);
  }, 0);
  
  // Combined
  const subtotal = labourSubtotal + partsSubtotal;
  
  // VAT (if applicable - 20% for UK)
  const vat = subtotal * 0.20;
  
  // Grand total
  const total = subtotal + vat;
  
  return {
    labour: labourSubtotal,
    parts: partsSubtotal,
    subtotal: subtotal,
    vat: vat,
    total: total
  };
}

// ============================================================
// STEP 4: Example Form Submission Handler
// ============================================================

async function handleAppointmentSubmit(event) {
  event.preventDefault();
  
  try {
    // Validate chips data exists
    const { jobs, parts } = getChipsData();
    if (jobs.length === 0 && parts.length === 0) {
      alert('Please add at least one job or part');
      return;
    }
    
    // Prepare data
    const appointmentData = prepareAppointmentData();
    
    // Log for debugging
    console.info('Submitting appointment:', appointmentData);
    
    // Send to your backend (example with Firestore)
    // const docRef = await addDoc(collection(db, 'appointments'), appointmentData);
    // console.info('Appointment created with ID:', docRef.id);
    
    // Show success message
    alert('✅ Appointment created successfully!');
    
    // Reset form if needed
    // resetForm();
    
  } catch (error) {
    console.error('Error submitting appointment:', error);
    alert('Failed to create appointment: ' + error.message);
  }
}

// ============================================================
// STEP 5: Format Data for Backend
// ============================================================

function formatForBackend(appointmentData) {
  return {
    // Client
    clientName: appointmentData.client.name,
    clientEmail: appointmentData.client.email,
    clientPhone: appointmentData.client.phone,
    clientAddress: appointmentData.client.address,
    
    // Vehicle
    vehicleMake: appointmentData.vehicle.make,
    vehicleModel: appointmentData.vehicle.model,
    vehicleRegPlate: appointmentData.vehicle.regPlate,
    vehicleMileage: appointmentData.vehicle.mileage,
    
    // Line items
    jobs: appointmentData.services.map(job => ({
      description: job.name,
      quantity: job.qty,
      unitPrice: job.price,
      lineTotal: job.qty * job.price
    })),
    
    parts: appointmentData.parts.map(part => ({
      description: part.name,
      quantity: part.qty,
      unitPrice: part.price,
      lineTotal: part.qty * part.price
    })),
    
    // Totals
    labourTotal: appointmentData.totals.labour,
    partsTotal: appointmentData.totals.parts,
    subtotal: appointmentData.totals.subtotal,
    vat: appointmentData.totals.vat,
    grandTotal: appointmentData.totals.total,
    
    // Metadata
    notes: appointmentData.notes,
    createdAt: appointmentData.createdAt,
    status: appointmentData.status,
    
    // Optional: Track chip IDs for editing later
    metadata: {
      appVersion: '1.0',
      platform: window.innerWidth < 768 ? 'mobile' : 'desktop'
    }
  };
}

// ============================================================
// STEP 6: Export Invoice from Appointment
// ============================================================

async function createInvoiceFromAppointment(appointmentData) {
  try {
    const invoiceData = {
      // Generate invoice number
      invoiceNumber: `INV-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      
      // Client info from appointment
      clientName: appointmentData.client.name,
      clientEmail: appointmentData.client.email,
      clientPhone: appointmentData.client.phone,
      clientAddress: appointmentData.client.address,
      
      // Vehicle info
      vehicleDetails: `${appointmentData.vehicle.make} ${appointmentData.vehicle.model}`,
      regPlate: appointmentData.vehicle.regPlate,
      mileage: appointmentData.vehicle.mileage,
      
      // Line items (same as appointment)
      services: appointmentData.services,
      parts: appointmentData.parts,
      
      // Totals
      subtotal: appointmentData.totals.subtotal,
      vat: appointmentData.totals.vat,
      total: appointmentData.totals.total,
      
      // Notes
      workSummary: appointmentData.notes,
      
      // Status
      status: 'draft',
      appointmentReference: appointmentData.createdAt
    };
    
    // Save to Firestore invoices collection
    // const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
    // return docRef.id;
    
    return invoiceData;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

// ============================================================
// STEP 7: Format for CSV/Excel Export
// ============================================================

function formatForCSV(appointmentData) {
  const rows = [
    ['Transvortex LTD - Appointment Record'],
    [],
    ['CLIENT INFORMATION'],
    ['Name', appointmentData.client.name],
    ['Email', appointmentData.client.email],
    ['Phone', appointmentData.client.phone],
    ['Address', appointmentData.client.address],
    [],
    ['VEHICLE INFORMATION'],
    ['Make/Model', `${appointmentData.vehicle.make} ${appointmentData.vehicle.model}`],
    ['Registration', appointmentData.vehicle.regPlate],
    ['Mileage', appointmentData.vehicle.mileage],
    [],
    ['SERVICES'],
    ['Description', 'Qty', 'Unit Price', 'Total']
  ];
  
  // Add services
  appointmentData.services.forEach(job => {
    rows.push([
      job.name,
      job.qty,
      `£${job.price.toFixed(2)}`,
      `£${(job.qty * job.price).toFixed(2)}`
    ]);
  });
  
  // Add parts
  if (appointmentData.parts.length > 0) {
    rows.push([], ['PARTS'], ['Description', 'Qty', 'Unit Price', 'Total']);
    appointmentData.parts.forEach(part => {
      rows.push([
        part.name,
        part.qty,
        `£${part.price.toFixed(2)}`,
        `£${(part.qty * part.price).toFixed(2)}`
      ]);
    });
  }
  
  // Add totals
  rows.push(
    [],
    ['SUMMARY'],
    ['Labour Total', `£${appointmentData.totals.labour.toFixed(2)}`],
    ['Parts Total', `£${appointmentData.totals.parts.toFixed(2)}`],
    ['Subtotal', `£${appointmentData.totals.subtotal.toFixed(2)}`],
    ['VAT (20%)', `£${appointmentData.totals.vat.toFixed(2)}`],
    ['GRAND TOTAL', `£${appointmentData.totals.total.toFixed(2)}`],
    [],
    ['NOTES'],
    [appointmentData.notes]
  );
  
  return rows;
}

// ============================================================
// USAGE EXAMPLES
// ============================================================

/*
// Example 1: Get chips data
const { jobs, parts } = getChipsData();
console.log('Jobs:', jobs);
console.log('Parts:', parts);

// Example 2: Prepare appointment data
const data = prepareAppointmentData();
console.log('Appointment data:', data);

// Example 3: Calculate totals
const totals = calculateTotals(data.services, data.parts);
console.log('Totals:', totals);

// Example 4: Format for backend
const backendData = formatForBackend(data);
console.log('Backend formatted:', backendData);

// Example 5: Create invoice
const invoice = createInvoiceFromAppointment(data);
console.log('Invoice:', invoice);

// Example 6: Export as CSV
const csvData = formatForCSV(data);
console.log('CSV export:', csvData);

// Example 7: Hook up form submit
document.getElementById('appointmentForm').addEventListener('submit', handleAppointmentSubmit);
*/

// ============================================================
// EXPORT FOR USE IN OTHER MODULES
// ============================================================

export {
  prepareAppointmentData,
  calculateTotals,
  handleAppointmentSubmit,
  formatForBackend,
  createInvoiceFromAppointment,
  formatForCSV
};
