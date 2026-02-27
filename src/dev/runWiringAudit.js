/**
 * runWiringAudit.js — Runtime wiring inspection (DevTools helper)
 *
 * Usage (browser console):
 *   window.runWiringAudit()        // full report to console
 *   window.runWiringAudit({ json: true })  // returns raw data object
 *
 * SAFE: This module is passive. It registers nothing and does nothing
 * until window.runWiringAudit() is explicitly called.
 *
 * Load via:
 *   <script src="src/dev/runWiringAudit.js"></script>   (dev only)
 * or in DevTools console:
 *   await import('/src/dev/runWiringAudit.js')
 */

(function installWiringAudit() {
  'use strict';

  // ─── Known stub/noop function body signatures ─────────────────────────────
  // A function is considered a "stub" if its entire body is <= 10 chars (after
  // stripping braces and whitespace) OR if it has a specific marker comment.
  function isStubOrNoop(fn) {
    if (typeof fn !== 'function') return false;
    try {
      const src = fn.toString();
      // Strip function signature — keep only the body
      const bodyMatch = src.match(/\{([\s\S]*)\}\s*$/);
      if (!bodyMatch) return false;
      const body = bodyMatch[1].trim();
      // Empty body
      if (body === '') return true;
      // Body with only a comment
      if (/^\/\/[^\n]*$/.test(body)) return true;
      // Body that is just a console.log or return undefined
      if (/^console\.(log|warn|info)\s*\(/.test(body) && body.split('\n').length === 1) return true;
      // Very short bodies (arrow functions coerced: () => {})
      if (body.length <= 6) return true;
      return false;
    } catch {
      return false;
    }
  }

  // ─── Collect known stub function names from window ────────────────────────
  function collectKnownStubs() {
    const stubs = [];
    // Scan all window properties that look like functions
    try {
      for (const key of Object.keys(window)) {
        if (typeof window[key] === 'function' && isStubOrNoop(window[key])) {
          stubs.push(key);
        }
      }
    } catch {
      // Some window properties may throw on access
    }
    return stubs;
  }

  // ─── Extract function name(s) from an onclick expression string ───────────
  function extractFnNamesFromOnclick(expr) {
    const names = [];
    // window.fnName(...)
    const re1 = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let m;
    while ((m = re1.exec(expr)) !== null) names.push({ name: m[1], qualified: true });
    // bare fnName(...)
    if (names.length === 0) {
      const re2 = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;
      const m2 = re2.exec(expr.trim());
      if (m2) names.push({ name: m2[1], qualified: false });
    }
    return names;
  }

  // ─── Resolve a function name to its window value ──────────────────────────
  function resolveWindowFn(name) {
    return typeof window[name] === 'function' ? window[name] : undefined;
  }

  // ─── Main audit function ──────────────────────────────────────────────────
  function runWiringAudit(opts = {}) {
    const { json = false, verbose = false } = opts;

    console.group('%c🔍 Wiring Audit', 'font-weight:bold;font-size:14px;color:#f97316');
    console.log('Scanning live DOM…');

    // 1. Total clickable controls
    const clickableSelectors = 'button, a[href], [role="button"], [onclick], [data-action]';
    const allClickable = Array.from(document.querySelectorAll(clickableSelectors));

    // 2. data-action elements missing / empty data-id
    const actionElements = Array.from(document.querySelectorAll('[data-action]'));
    const missingId = actionElements.filter(el => {
      const id = el.getAttribute('data-id');
      return id === null || id.trim() === '';
    });

    // 3. Elements with data-action but data-id present (properly wired)
    const properlyWired = actionElements.filter(el => {
      const id = el.getAttribute('data-id');
      return id !== null && id.trim() !== '';
    });

    // 4. Elements with inline onclick
    const onclickElements = Array.from(document.querySelectorAll('[onclick]'));

    // 5. Known stubs at call time
    const knownStubs = collectKnownStubs();

    // 6. onclick elements whose handler calls a stub
    const onclickCallsStub = [];
    const onclickCallsUndefined = [];

    for (const el of onclickElements) {
      const expr = el.getAttribute('onclick') || '';
      const fns = extractFnNamesFromOnclick(expr);
      for (const { name } of fns) {
        const fn = resolveWindowFn(name) ?? (typeof window[name] === 'function' ? window[name] : undefined);
        if (!fn) {
          onclickCallsUndefined.push({ element: el, expression: expr, missingFn: name });
        } else if (knownStubs.includes(name) || isStubOrNoop(fn)) {
          onclickCallsStub.push({ element: el, expression: expr, stubFn: name });
        }
      }
    }

    // 7. Invoice-related links and buttons
    const invoiceLinks = Array.from(document.querySelectorAll(
      'a[href*="invoice.html"], [onclick*="invoice.html"], [onclick*="openInvoice"], [data-action*="invoice"], [data-action*="Invoice"]'
    ));

    // ─── OUTPUT ──────────────────────────────────────────────────────────────
    console.group('📊 Summary');
    console.log(`Total clickable controls:        ${allClickable.length}`);
    console.log(`- data-action elements:          ${actionElements.length}`);
    console.log(`  - properly wired (has data-id): ${properlyWired.length}`);
    console.log(`  - MISSING data-id:             ${missingId.length} ⚠️`);
    console.log(`- inline onclick elements:       ${onclickElements.length}`);
    console.log(`  - calls stub/noop:             ${onclickCallsStub.length} ⚠️`);
    console.log(`  - calls undefined fn:          ${onclickCallsUndefined.length} 🔴`);
    console.log(`Invoice-related controls:        ${invoiceLinks.length}`);
    console.log(`Known stub window functions:     ${knownStubs.length} — [${knownStubs.join(', ')}]`);
    console.groupEnd();

    if (missingId.length) {
      console.group(`⚠️  data-action MISSING data-id (${missingId.length})`);
      missingId.forEach(el => {
        console.warn(
          `[${el.tagName.toLowerCase()}] action="${el.getAttribute('data-action')}" text="${(el.textContent || '').trim().slice(0, 40)}"`,
          el
        );
      });
      console.groupEnd();
    }

    if (onclickCallsStub.length) {
      console.group(`⚠️  onclick → stub/noop function (${onclickCallsStub.length})`);
      onclickCallsStub.forEach(({ element, expression, stubFn }) => {
        console.warn(`onclick="${expression.slice(0, 80)}" → window.${stubFn} is a stub`, element);
      });
      console.groupEnd();
    }

    if (onclickCallsUndefined.length) {
      console.group(`🔴  onclick → UNDEFINED function (${onclickCallsUndefined.length})`);
      onclickCallsUndefined.forEach(({ element, expression, missingFn }) => {
        console.error(`onclick="${expression.slice(0, 80)}" → window.${missingFn} NOT FOUND`, element);
      });
      console.groupEnd();
    }

    if (invoiceLinks.length || verbose) {
      console.group(`🧾 Invoice-related controls (${invoiceLinks.length})`);
      invoiceLinks.forEach(el => {
        const href = el.getAttribute('href') || el.getAttribute('onclick') || el.getAttribute('data-action') || '';
        console.log(`[${el.tagName.toLowerCase()}] action="${el.getAttribute('data-action') || ''}" href/onclick="${href.slice(0, 100)}"`, el);
      });
      console.groupEnd();
    }

    if (verbose) {
      console.group('🔍 All inline onclick elements');
      onclickElements.forEach(el => {
        console.log(`onclick="${(el.getAttribute('onclick') || '').slice(0, 100)}"`, el);
      });
      console.groupEnd();
    }

    console.groupEnd(); // root group

    const result = {
      totalClickable: allClickable.length,
      dataActionTotal: actionElements.length,
      properlyWired: properlyWired.length,
      missingDataId: missingId.map(el => ({
        tag: el.tagName.toLowerCase(),
        action: el.getAttribute('data-action'),
        text: (el.textContent || '').trim().slice(0, 60),
        element: el
      })),
      onclickTotal: onclickElements.length,
      onclickCallsStub,
      onclickCallsUndefined,
      invoiceControls: invoiceLinks,
      knownStubs
    };

    if (json) return result;
    return result;
  }

  // ─── Expose globally ──────────────────────────────────────────────────────
  window.runWiringAudit = runWiringAudit;

  if (typeof console !== 'undefined') {
    console.info(
      '%c[runWiringAudit] Ready. Call window.runWiringAudit() to inspect wiring.',
      'color:#6366f1;font-style:italic'
    );
  }

})();
