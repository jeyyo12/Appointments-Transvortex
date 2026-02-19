/**
 * KPI Dashboard Quick Verification Script
 * 
 * Copy and paste this entire block into browser console (F12)
 * Will test if metrics engine is working correctly
 */

(function() {
  console.clear();
  console.log('%c🔍 KPI DASHBOARD VERIFICATION SCRIPT', 'font-size: 16px; font-weight: bold; color: #FF7A24;');
  console.log('Running comprehensive system checks...\n');

  const results = {
    pass: [],
    fail: [],
    warn: []
  };

  // ==========================================
  // CHECK 1: Metrics Engine Imported
  // ==========================================
  console.log('%cCHECK 1: Metrics Engine Functions', 'font-weight: bold; color: #0066CC;');
  
  if (typeof window.computeDashboardMetrics === 'function') {
    console.log('✅ computeDashboardMetrics() exists');
    results.pass.push('Metrics engine imported');
  } else {
    console.error('❌ computeDashboardMetrics() NOT FOUND');
    results.fail.push('Metrics engine not imported');
  }

  if (typeof window.updateDashboardMetrics === 'function') {
    console.log('✅ updateDashboardMetrics() exists');
    results.pass.push('Update trigger available');
  } else {
    console.error('❌ updateDashboardMetrics() NOT FOUND');
    results.fail.push('Update trigger missing');
  }

  if (typeof window.renderDashboardMetrics === 'function') {
    console.log('✅ renderDashboardMetrics() exists');
    results.pass.push('Render function available');
  } else {
    console.error('❌ renderDashboardMetrics() NOT FOUND');
    results.fail.push('Render function missing');
  }

  // ==========================================
  // CHECK 2: Data Loading
  // ==========================================
  console.log('\n%cCHECK 2: Data Availability', 'font-weight: bold; color: #0066CC;');
  
  const aptsCount = (window.appointments || []).length;
  const invCount = (window.allInvoices || []).length;
  
  console.log(`📊 Appointments loaded: ${aptsCount}`);
  if (aptsCount > 0) {
    console.log('✅ Appointments data available');
    results.pass.push('Appointments loaded');
  } else {
    console.warn('⚠️ No appointments found (may be loading)');
    results.warn.push('Appointments not yet loaded');
  }

  console.log(`📦 Invoices loaded: ${invCount}`);
  if (invCount > 0) {
    console.log('✅ Invoices data available');
    results.pass.push('Invoices loaded');
  } else {
    console.warn('⚠️ No invoices found (may be loading)');
    results.warn.push('Invoices not yet loaded');
  }

  // ==========================================
  // CHECK 3: DOM Elements
  // ==========================================
  console.log('\n%cCHECK 3: DOM Elements', 'font-weight: bold; color: #0066CC;');
  
  const domElements = [
    { id: 'totalAppointments', desc: 'Total Jobs count' },
    { id: 'todayAppointments', desc: 'Today count' },
    { id: 'upcomingAppointments', desc: 'Planning count' },
    { id: 'doneAppointments', desc: 'Revenue count' },
    { id: 'summaryToday', desc: 'Summary Today' },
    { id: 'summaryOverdue', desc: 'Summary Overdue' },
    { id: 'summaryPending', desc: 'Summary Pending' },
    { id: 'summaryWeek', desc: 'Summary Week' }
  ];

  let domMissing = 0;
  domElements.forEach(el => {
    const elem = document.getElementById(el.id);
    if (elem) {
      console.log(`✅ #${el.id} (${el.desc})`);
    } else {
      console.error(`❌ #${el.id} NOT FOUND (${el.desc})`);
      domMissing++;
    }
  });

  if (domMissing === 0) {
    results.pass.push('All DOM elements exist');
  } else {
    results.fail.push(`${domMissing} DOM elements missing`);
  }

  // ==========================================
  // CHECK 4: Manual Metrics Computation
  // ==========================================
  console.log('\n%cCHECK 4: Metrics Computation Test', 'font-weight: bold; color: #0066CC;');
  
  if (typeof window.computeDashboardMetrics === 'function' && aptsCount > 0) {
    const testMetrics = window.computeDashboardMetrics(
      window.appointments || [],
      window.allInvoices || []
    );
    
    console.log('📊 Computed Metrics:');
    console.table({
      'Total Jobs': testMetrics.totalJobs,
      'Active Jobs': testMetrics.activeJobs,
      'Completed': testMetrics.completedJobs,
      'Today': testMetrics.todayJobs,
      'Overdue': testMetrics.overdueJobs,
      'Upcoming': testMetrics.upcomingJobs,
      'Unpaid £': testMetrics.unpaidTotalGBP.toFixed(2),
      'Week Revenue £': testMetrics.weekRevenueGBP.toFixed(2)
    });
    
    results.pass.push('Metrics computed successfully');
  } else {
    console.warn('⚠️ Cannot test metrics (missing function or data)');
    results.warn.push('Metrics computation test skipped');
  }

  // ==========================================
  // CHECK 5: Manual Render Test
  // ==========================================
  console.log('\n%cCHECK 5: Render to DOM Test', 'font-weight: bold; color: #0066CC;');
  
  if (typeof window.renderDashboardMetrics === 'function' && aptsCount > 0) {
    console.log('🖌️ Rendering metrics to DOM...');
    
    // Get before values
    const beforeTotal = document.getElementById('totalAppointments')?.textContent || '0';
    
    // Render
    const testMetrics = window.computeDashboardMetrics(
      window.appointments || [],
      window.allInvoices || []
    );
    window.renderDashboardMetrics(testMetrics);
    
    // Get after values
    const afterTotal = document.getElementById('totalAppointments')?.textContent || '0';
    
    console.log(`Before render: #totalAppointments = "${beforeTotal}"`);
    console.log(`After render: #totalAppointments = "${afterTotal}"`);
    
    if (afterTotal !== '0' && afterTotal !== '') {
      console.log('✅ DOM updated with real values');
      results.pass.push('DOM render successful');
    } else {
      console.warn('⚠️ DOM still shows 0 or empty');
      results.warn.push('DOM values may not have updated');
    }
  } else {
    console.warn('⚠️ Cannot test render (missing function or data)');
    results.warn.push('Render test skipped');
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n%c═══════════════════════════════════════', 'color: #666;');
  console.log('%c✅ VERIFICATION SUMMARY', 'font-size: 14px; font-weight: bold; color: #00AA00;');
  console.log('%c═══════════════════════════════════════', 'color: #666;');
  
  console.log(`\n✅ PASSED: ${results.pass.length}`);
  results.pass.forEach(r => console.log(`   • ${r}`));
  
  if (results.warn.length > 0) {
    console.log(`\n⚠️  WARNINGS: ${results.warn.length}`);
    results.warn.forEach(r => console.log(`   • ${r}`));
  }
  
  if (results.fail.length > 0) {
    console.log(`\n❌ FAILED: ${results.fail.length}`);
    results.fail.forEach(r => console.log(`   • ${r}`));
  }

  // Overall result
  console.log('\n%c═══════════════════════════════════════', 'color: #666;');
  if (results.fail.length === 0 && aptsCount > 0) {
    console.log('%c✅ SYSTEM READY - KPI Dashboard should work!', 'font-size: 14px; font-weight: bold; color: #00AA00; background: #E8F5E9; padding: 8px;');
    console.log('\n📊 KPI Dashboard Status:');
    console.log('   • Metrics engine: ✅');
    console.log('   • Data loading: ✅');
    console.log('   • DOM elements: ✅');
    console.log('   • Computation: ✅');
    console.log('   • Rendering: ✅');
  } else if (results.fail.length === 0) {
    console.log('%c⚠️  WAITING FOR DATA', 'font-size: 14px; font-weight: bold; color: #FF9800; background: #FFF3E0; padding: 8px;');
    console.log('\nSystem is ready but waiting for Firestore data.');
    console.log('This is normal - Firestore takes 2-5 seconds to load.');
    console.log('\n🔄 Wait 3-5 seconds then run this script again...');
  } else {
    console.log('%c❌ ISSUES DETECTED', 'font-size: 14px; font-weight: bold; color: #DD0000; background: #FFEBEE; padding: 8px;');
    console.log('\nPlease check the failures above and troubleshooting guide.');
  }
  console.log('%c═══════════════════════════════════════\n', 'color: #666;');

  // Return summary for re-running
  return {
    appointmentsLoaded: aptsCount,
    invoicesLoaded: invCount,
    metricsEngineAvailable: typeof window.computeDashboardMetrics === 'function',
    passed: results.pass.length,
    failed: results.fail.length,
    warnings: results.warn.length
  };
})();

// Quick tip for next steps
console.log('%c💡 NEXT STEPS:', 'font-weight: bold; color: #0066CC;');
console.log('1. If all checks pass: Refresh page to verify KPIs show real values');
console.log('2. If waiting for data: Run this script again in 5 seconds');
console.log('3. If failures: Check KPI_DASHBOARD_FIX_GUIDE.md Troubleshooting section');
