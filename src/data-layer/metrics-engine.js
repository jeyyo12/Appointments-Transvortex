/**
 * METRICS ENGINE - DERIVED KPI CALCULATIONS
 * 
 * Computes all business metrics from store data.
 * Called whenever store data changes, but heavily cached for performance.
 * 
 * Metrics:
 * - Jobs: total, today, upcoming, completed, cancelled
 * - Invoices: unpaid count, paid count, total count
 * - Revenue: week total, unpaid total, today total, month total, all-time total
 * - Weekly buckets: revenue grouped by ISO week
 */

import store from './store.js';
import { toNumber } from './formatters.js';

class MetricsEngine {
  constructor() {
    this.cachedMetrics = null;
    this.lastComputeTime = 0;
    this.computeCount = 0;
    this.cacheHits = 0;
    
    // Listen to store changes to invalidate cache
    this.storeUnsubscribe = store.subscribe((event) => {
      // Only invalidate cache for data changes, not metrics updates
      if (event.type !== 'metricsUpdated') {
        this.invalidateCache();
      }
    });
  }
  
  /**
   * Mark cache as invalid
   * @private
   */
  invalidateCache() {
    this.cachedMetrics = null;
  }
  
  /**
   * Main compute method - called by Firestore listeners
   * Heavily memoized to avoid recalculation
   */
  compute() {
    // Return cached result if available
    if (this.cachedMetrics) {
      this.cacheHits++;
      return this.cachedMetrics;
    }
    
    const startTime = performance.now();
    this.computeCount++;
    
    const metrics = {
      jobs: this.computeJobMetrics(),
      invoices: this.computeInvoiceMetrics(),
      revenue: this.computeRevenueMetrics(),
      weeklyBuckets: this.computeWeeklyBuckets(),
      dashboard: this.computeDashboardMetrics()
    };
    
    // Cache the result
    this.cachedMetrics = metrics;
    
    const computeTime = performance.now() - startTime;
    if (computeTime > 10) {
      console.log(`⚙️ Metrics computed in ${computeTime.toFixed(2)}ms (${this.computeCount} total, ${this.cacheHits} cache hits)`);
    }
    
    return metrics;
  }
  
  /**
   * Compute job-related metrics
   * @private
   */
  computeJobMetrics() {
    const appointments = store.getAllAppointments();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const jobs = {
      total: 0,
      today: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0
    };
    
    appointments.forEach(apt => {
      if (!apt.id) return; // Skip invalid entries
      
      jobs.total++;
      
      // Normalize status
      const status = (apt.status || '').toLowerCase().replace(/[àáâăäandèéêëiòóôõöuùúûüûăîșț]/g, 
        c => ({à:'a', á:'a', â:'a', ă:'a', ä:'a', è:'e', é:'e', ê:'e', ë:'e', i:'i', ò:'o', ó:'o', ô:'o', õ:'o', ö:'o', u:'u', ù:'u', ú:'u', û:'u', ü:'u', ă:'a', î:'i', ș:'s', ț:'t'}[c] || c));
      
      if (status === 'completă' || status === 'completed') {
        jobs.completed++;
      } else if (status === 'anulată' || status === 'cancelled') {
        jobs.cancelled++;
      } else {
        // Check appointment date
        try {
          const aptDate = new Date(apt.appointmentDate || apt.startAt);
          const aptDateNormalized = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
          
          if (aptDateNormalized.getTime() === today.getTime()) {
            jobs.today++;
          } else if (aptDateNormalized > today) {
            jobs.upcoming++;
          }
        } catch (e) {
          console.warn('⚠️ Invalid appointment date:', apt.appointmentDate || apt.startAt);
        }
      }
    });
    
    return jobs;
  }
  
  /**
   * Compute invoice-related metrics
   * Safely normalizes string/number totals and payment status
   * @private
   */
  computeInvoiceMetrics() {
    const invoices = store.getAllInvoices();
    const invoices_metrics = {
      unpaidCount: 0,
      paidCount: 0,
      totalCount: invoices.length
    };
    
    invoices.forEach(inv => {
      if (!inv || !inv.id) return;
      
      // Normalize numeric values (handle string values from Firestore)
      const total = toNumber(inv.total);
      const amountPaid = toNumber(inv.amountPaid);
      
      // Determine if paid (strict check)
      const isPaid = inv.paid === true || amountPaid >= total;
      
      if (isPaid) {
        invoices_metrics.paidCount++;
      } else {
        invoices_metrics.unpaidCount++;
      }
    });
    
    return invoices_metrics;
  }
  
  /**
   * Compute revenue-related metrics
   * Safely normalizes all numeric values and dates
   * @private
   */
  computeRevenueMetrics() {
    const invoices = store.getAllInvoices();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const revenue = {
      weekTotal: 0,
      unpaidTotal: 0,
      todayTotal: 0,
      monthTotal: 0,
      allTimeTotal: 0
    };
    
    invoices.forEach(inv => {
      if (!inv || !inv.id) return;
      
      // CRITICAL: Normalize all numeric values from Firestore (may be strings)
      const total = toNumber(inv.total);
      const amountPaid = toNumber(inv.amountPaid);
      const outstanding = total - amountPaid;
      
      // Skip zero invoices
      if (total <= 0) return;
      
      revenue.allTimeTotal += total;
      
      // Check if paid
      const isPaid = inv.paid === true || amountPaid >= total;
      
      // Parse invoice date safely
      let invDateNormalized = null;
      try {
        const invDate = new Date(inv.invoiceDate || inv.createdAt);
        if (!isNaN(invDate.getTime())) {
          invDateNormalized = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
        }
      } catch (e) {
        console.warn('⚠️ Invalid invoice date:', inv.invoiceDate || inv.createdAt, e.message);
      }
      
      if (invDateNormalized) {
        if (isPaid) {
          // Only count PAID invoices in time-based revenue metrics
          if (invDateNormalized >= weekStart && invDateNormalized < weekEnd) {
            revenue.weekTotal += total;
          }
          if (invDateNormalized >= monthStart && invDateNormalized.getMonth() === now.getMonth()) {
            revenue.monthTotal += total;
          }
          if (invDateNormalized.getTime() === today.getTime()) {
            revenue.todayTotal += total;
          }
        }
      }
      
      // Unpaid total: sum of outstanding amounts (regardless of date)
      if (outstanding > 0) {
        revenue.unpaidTotal += outstanding;
      }
    });
    
    return revenue;
  }
  
  /**
   * Compute weekly revenue buckets for analytics
   * Safely normalizes numeric values
   * @private
   */
  computeWeeklyBuckets() {
    const invoices = store.getAllInvoices();
    const weeklyBuckets = {};
    
    invoices.forEach(inv => {
      if (!inv || !inv.id) return;
      
      try {
        const invDate = new Date(inv.invoiceDate || inv.createdAt);
        if (isNaN(invDate.getTime())) return;
        
        const weekKey = this.getWeekKey(invDate);
        
        // Normalize numeric values
        const total = toNumber(inv.total);
        const amountPaid = toNumber(inv.amountPaid);
        const isPaid = inv.paid === true || amountPaid >= total;
        
        if (isPaid && total > 0) {
          weeklyBuckets[weekKey] = (weeklyBuckets[weekKey] || 0) + total;
        }
      } catch (e) {
        console.warn('⚠️ Invalid invoice date for weekly buckets:', inv.invoiceDate || inv.createdAt, e.message);
      }
    });
    
    return weeklyBuckets;
  }
  
  /**
   * Get ISO week key for a date (format: 'YYYY-W##')
   * @private
   */
  getWeekKey(date) {
    const d = new Date(date);
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 4);
    const timeToFirstWeek = yearStart.getTime() - new Date(yearStart.getFullYear(), 0, 4 - yearStart.getDay()).getTime();
    const weekNum = Math.round((d.getTime() - timeToFirstWeek) / (24 * 60 * 60 * 1000 * 7)) + 1;
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  
  /**
   * Compute dashboard-specific metrics (overdue, next appointment, uninvoiced completed)
   * @private
   */
  computeDashboardMetrics() {
    const appointments = store.getAllAppointments();
    const invoices = store.getAllInvoices();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let overdueCount = 0;
    let nextAppointmentTime = null;
    let nextAppointmentLabel = '';
    
    // Create a map of completed appointments that have invoices
    const appointmentIds = new Set();
    invoices.forEach(inv => {
      if (inv.appointmentId) {
        appointmentIds.add(inv.appointmentId);
      }
    });
    
    // Calculate overdue and next appointment
    appointments.forEach(apt => {
      if (!apt.id) return;
      
      // Normalize status
      const status = (apt.status || '').toLowerCase().replace(/[àáâăäandèéêëiòóôõöuùúûüûăîșț]/g, 
        c => ({à:'a', á:'a', â:'a', ă:'a', ä:'a', è:'e', é:'e', ê:'e', ë:'e', i:'i', ò:'o', ó:'o', ô:'o', õ:'o', ö:'o', u:'u', ù:'u', ú:'u', û:'u', ü:'u', ă:'a', î:'i', ș:'s', ț:'t'}[c] || c));
      
      // Skip completed and cancelled appointments
      if (status === 'completă' || status === 'completed' || status === 'anulată' || status === 'cancelled') {
        return;
      }
      
      try {
        const aptDate = new Date(apt.appointmentDate || apt.startAt);
        const aptDateNormalized = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
        
        // Count overdue (past appointments that aren't completed)
        if (aptDateNormalized < today) {
          overdueCount++;
        }
        
        // Track next appointment time
        if (aptDateNormalized >= today) {
          if (!nextAppointmentTime || aptDate < nextAppointmentTime) {
            nextAppointmentTime = aptDate;
          }
        }
      } catch (e) {
        console.warn('⚠️ Invalid appointment date:', apt.appointmentDate || apt.startAt);
      }
    });
    
    // Format next appointment label
    if (nextAppointmentTime) {
      const timeDiff = nextAppointmentTime - now;
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        nextAppointmentLabel = `In ${days} day${days > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        nextAppointmentLabel = `In ${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        nextAppointmentLabel = `In ${minutes}m`;
      } else {
        nextAppointmentLabel = 'Starting now';
      }
    } else {
      nextAppointmentLabel = 'No upcoming';
    }
    
    return {
      overdueCount,
      nextAppointmentTime,
      nextAppointmentLabel,
      uninvoicedCompleted: 0 // Placeholder - can be enhanced if needed
    };
  }
  
  /**
   * Get engine statistics for debugging
   */
  getStats() {
    return {
      computeCount: this.computeCount,
      cacheHits: this.cacheHits,
      hitRate: this.computeCount > 0 ? (this.cacheHits / this.computeCount * 100).toFixed(1) + '%' : 'N/A',
      isCached: this.cachedMetrics !== null
    };
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
    }
  }
}

// Create singleton instance
const metricsEngine = new MetricsEngine();

export { metricsEngine };
export default metricsEngine;
