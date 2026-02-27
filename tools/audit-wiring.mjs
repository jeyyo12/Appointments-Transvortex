/**
 * audit-wiring.mjs — Repo-wide static wiring audit
 * Usage: node tools/audit-wiring.mjs
 * Outputs: audit/audit-report.json  +  audit/audit-report.md
 *
 * No external dependencies (Node stdlib only).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'audit');

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const EXTENSIONS = ['.html', '.js', '.mjs'];
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '_archive_unused', 'audit', 'tools']);

// Actions that are item-scoped — they imply an entity id is needed for bindActionDelegation.
// Missing data-id on these is a REAL issue (not a false positive).
const ITEM_SCOPED_ACTIONS = new Set([
  'open', 'edit', 'delete', 'view', 'details', 'mark-paid', 'mark-unpaid',
  'invoice', 'open-invoice', 'view-invoice', 'edit-invoice', 'print-invoice',
  'reschedule', 'cancel-appointment', 'complete', 'notify', 'copy', 'duplicate',
  'remove', 'archive', 'restore', 'assign', 'download', 'send', 'share',
  'approve', 'reject', 'pay', 'mark-complete', 'mark-pending', 'add-note',
  'pdf', 'print', 'email-invoice', 'save-invoice'
]);

// Files/paths where missing data-id is expected (local delegation, not bindActionDelegation).
// These produce 'Likely false positive' items, not real broken candidates.
const DATA_ID_EXEMPT_FILES = [
  'invoice.html',
  'src/invoice.js',
  'src/modal.js',
  'src/shared/modal.js',
  'src/utils/notifications.js',
  'src/workspace/workspace-controller.js',
  'offline.html',
];

// Function names whose duplication is high-risk and should be called out explicitly.
const HIGH_RISK_DUPLICATE_NAMES = new Set([
  'generateInvoiceNumber', 'generateInvoiceNum',
  'openInvoice', 'openInvoiceFile', 'openInvoicePage', 'openInvoiceForAppointment', 'openInvoiceFromAppointment',
  'getOrCreateInvoice', 'getOrCreateInvoiceForAppointment',
  'createInvoice', 'renderInvoice', 'buildInvoice', 'saveInvoice',
]);

// Canonical invoice URL params: only these two keys are valid.
const CANONICAL_INVOICE_KEYS = new Set(['invoiceId', 'mode']);
const INVALID_INVOICE_KEYS = new Set(['aptId', 'appointmentId', 'id']);

// ─── FILE COLLECTION ─────────────────────────────────────────────────────────
function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

// ─── LINE-INDEXED SOURCE ─────────────────────────────────────────────────────
function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

function rel(filePath) {
  return filePath.replace(ROOT + path.sep, '').replace(/\\/g, '/');
}

function escapeMdCell(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

// ─── REGEX CONSTANTS ─────────────────────────────────────────────────────────
const RE_ADD_EVENT     = /addEventListener\s*\(\s*['"]click['"]/g;
const RE_CLOSEST_DELEG = /closest\s*\(\s*['"][^'"]*data-action[^'"]*['"]\s*\)/g;

// ─── ELEMENT-LEVEL PARSER for data-action + data-id co-occurrence ───────────
function extractActionIdPairs(source) {
  const tagRe = /<[^>]+>/g;
  const results = [];
  let m;
  while ((m = tagRe.exec(source)) !== null) {
    const tag = m[0];
    const actionMatch = /data-action\s*=\s*["']([^"']+)["']/.exec(tag);
    if (!actionMatch) continue;
    const action = actionMatch[1];
    const idMatch = /data-id\s*=\s*["']([^"']*)["']/.exec(tag);
    // An action is item-scoped if its name or a prefix is in ITEM_SCOPED_ACTIONS
    const actionBase = action.split('-').slice(0, 2).join('-');
    const isItemScoped = ITEM_SCOPED_ACTIONS.has(action) ||
      ITEM_SCOPED_ACTIONS.has(action.split('-')[0]) ||
      ITEM_SCOPED_ACTIONS.has(actionBase);
    results.push({
      action,
      isItemScoped,
      hasDataId: !!idMatch,
      dataId: idMatch ? idMatch[1] : undefined,
      idEmpty: idMatch ? idMatch[1].trim() === '' : undefined,
      snippet: tag.slice(0, 160)
    });
  }
  return results;
}

// ─── MAIN AUDIT ──────────────────────────────────────────────────────────────
function audit() {
  const files = collectFiles(ROOT);

  // IDs referenced by scripts/templates are considered wired even without inline onclick/data-action.
  const referencedElementIds = new Set();
  for (const filePath of files) {
    const src = fs.readFileSync(filePath, 'utf8');
    const byIdRe = /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let im;
    while ((im = byIdRe.exec(src)) !== null) referencedElementIds.add(im[1]);
    const qsIdRe = /querySelector(?:All)?\s*\(\s*['"]#([^'"\s>+~:\[]+)['"]\s*\)/g;
    let qm;
    while ((qm = qsIdRe.exec(src)) !== null) referencedElementIds.add(qm[1]);
  }

  // Accumulators
  const onclickHandlers = [];         // { file, line, expression }
  const dataActionCounts = {};        // action -> count
  const actionIdPairs = [];           // { file, action, isItemScoped, isExempt, hasDataId, ... }
  const windowExports = {};           // fnName -> [{ file, line, isStub, isNoop }]
  const windowCallsFromOnclick = [];  // { file, line, caller, callee }
  const addEventListenerClicks = [];  // { file, line }
  const closestDelegations = [];      // { file, line, snippet }
  const invoiceOpenCalls = [];        // { file, line, url, params, via }
  const invoiceFunctionCalls = [];    // { file, line, fnName }
  const invoiceNumGenerators = [];    // { file, line, fnName }
  const deadButtons = [];             // { file, tagSnippet }
  const scrollJumps = [];             // { file, line, kind, snippet }
  const suspiciousNavigation = [];    // { file, line, snippet }
  const stubOnInits = new Set();      // window.fn = window.fn || (() => {}) — true noop guard
  const duplicateFnNames = {};        // fnName -> [{ file, line }]

  // TRUE stub detection: only flag lines where the fallback IS an empty function body
  const STUB_NOOP_PATTERN = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*window\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\|\|\s*\(\s*\(\s*\)\s*=>\s*\{[^}]{0,20}\}\s*\)/;

  for (const filePath of files) {
    const lines = readLines(filePath);
    const source = lines.join('\n');
    const fileRel = rel(filePath);
    const isHtml = fileRel.endsWith('.html');

    // ── onclick handlers ──
    lines.forEach((line, i) => {
      const re = /onclick\s*=\s*["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const expr = m[1];
        onclickHandlers.push({ file: fileRel, line: i + 1, expression: expr });
        // window.fn() calls inside onclick expression
        const callRe = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        let cm;
        while ((cm = callRe.exec(expr)) !== null) {
          windowCallsFromOnclick.push({ file: fileRel, line: i + 1, caller: expr, callee: cm[1] });
        }
        // Bare function calls (not window.*)
        const bareCallRe = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;
        const bm = bareCallRe.exec(expr.trim());
        if (bm && bm[1] !== 'window' && !expr.includes('window.')) {
          windowCallsFromOnclick.push({ file: fileRel, line: i + 1, caller: expr, callee: bm[1], bare: true });
        }
      }
    });

    // ── data-action counts + action/id pairs ──
    const isExemptFile = DATA_ID_EXEMPT_FILES.some(exempt =>
      fileRel === exempt || fileRel.endsWith('/' + exempt.replace(/^.*\//, '')));
    const pairs = extractActionIdPairs(source);
    for (const p of pairs) {
      dataActionCounts[p.action] = (dataActionCounts[p.action] || 0) + 1;
      actionIdPairs.push({ file: fileRel, ...p, isExempt: isExemptFile });
    }

    // ── UI/UX: dead / no-op controls (HTML heuristic) ──
    if (isHtml) {
      const controlTagRe = /<(button|a)\b[^>]*>/gi;
      let tm;
      while ((tm = controlTagRe.exec(source)) !== null) {
        const tag = tm[0];
        const tagLower = tag.toLowerCase();
        const classMatch = /class\s*=\s*["']([^"']+)["']/i.exec(tag);
        const classValue = (classMatch?.[1] || '').toLowerCase();
        const looksUiControl = /(btn|button|icon|action|tv-|appt|invoice|pill)/.test(classValue);
        if (!looksUiControl) continue;

        const hasDataAction = /\bdata-action\s*=\s*["'][^"']*["']/i.test(tag);
        const hasOnclick = /\bonclick\s*=\s*["'][^"']*["']/i.test(tag);
        const hrefMatch = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag);
        const hasHref = !!hrefMatch;
        const hrefValue = (hrefMatch?.[1] || '').trim();
        const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag);
        const elementId = idMatch?.[1] || '';
        const hasKnownUiDataHook = /\bdata-(appt-tab|tab|tag|mode|notif-close|invoice-mode|workspace-id)\b/i.test(tag);

        if (elementId && referencedElementIds.has(elementId)) continue;
        if (hasKnownUiDataHook) continue;

        if (tagLower.startsWith('<button')) {
          const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(tag);
          const typeValue = (typeMatch?.[1] || '').toLowerCase();
          if (typeValue === 'submit') continue;
          if (!hasDataAction && !hasOnclick && !hasHref) {
            deadButtons.push({ file: fileRel, tagSnippet: tag.slice(0, 220) });
          }
        } else if (tagLower.startsWith('<a')) {
          if (hrefValue === '#' || hrefValue.startsWith('#')) continue;
          if (!hasDataAction && !hasOnclick && !hasHref) {
            deadButtons.push({ file: fileRel, tagSnippet: tag.slice(0, 220) });
          }
        }
      }
    }

    // ── window exports ──
    lines.forEach((line, i) => {
      if (STUB_NOOP_PATTERN.test(line)) {
        const m = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/.exec(line);
        if (m) stubOnInits.add(m[1]);
      }
      const exportRe = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
      let em;
      while ((em = exportRe.exec(line)) !== null) {
        const fn = em[1];
        if (!windowExports[fn]) windowExports[fn] = [];
        const isNoop =
          /window\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*(?:\(\s*\)\s*=>\s*\{\s*\}|\(\s*\)\s*=>\s*\{\}|function\s*\([^)]*\)\s*\{\s*\})/.test(line) ||
          /\|\|\s*\(\s*\(\s*\.\.\.?[a-zA-Z_$]*\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line);
        windowExports[fn].push({ file: fileRel, line: i + 1, isStub: stubOnInits.has(fn), isNoop });
      }
    });

    // ── inline HTML function declarations (global in classic <script>) ──
    // This avoids false positives for onclick="fn()" when fn is declared as:
    // function fn() { ... } inside index.html/offline.html scripts.
    if (fileRel.endsWith('.html')) {
      const fnDeclRe = /(?:^|\s)function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
      let fm;
      while ((fm = fnDeclRe.exec(source)) !== null) {
        const fn = fm[1];
        if (!windowExports[fn]) windowExports[fn] = [];
        const lineNum = source.slice(0, fm.index).split('\n').length;
        windowExports[fn].push({ file: fileRel, line: lineNum, isStub: false, isNoop: false, isDeclared: true });
      }
    }

    // ── addEventListener click ──
    lines.forEach((line, i) => {
      if (RE_ADD_EVENT.test(line)) {
        addEventListenerClicks.push({ file: fileRel, line: i + 1 });
        RE_ADD_EVENT.lastIndex = 0;
      }
    });

    // ── closest() delegation on data-action ──
    lines.forEach((line, i) => {
      if (RE_CLOSEST_DELEG.test(line)) {
        closestDelegations.push({ file: fileRel, line: i + 1, snippet: line.trim().slice(0, 120) });
        RE_CLOSEST_DELEG.lastIndex = 0;
      }
    });

    // ── invoice open calls (window.open, location.href, href= attributes) ──
    lines.forEach((line, i) => {
      const lineNo = i + 1;
      const trimmed = line.trim();

      if (fileRel === 'FIRESTORE_DIAGNOSTIC.html') {
        return;
      }

      // UI/UX: scroll-jump triggers
      let mh;
      const hrefHashRe = /href\s*=\s*["']#([^"']*)["']/gi;
      while ((mh = hrefHashRe.exec(line)) !== null) {
        const target = mh[1] || '';
        scrollJumps.push({
          file: fileRel,
          line: lineNo,
          kind: target === '' ? 'href-empty-hash' : 'href-hash',
          snippet: trimmed.slice(0, 200)
        });
      }
      if (/\blocation\.hash\s*=/.test(line)) {
        scrollJumps.push({ file: fileRel, line: lineNo, kind: 'location-hash', snippet: trimmed.slice(0, 200) });
      }
      if (/\bscrollIntoView\s*\(/.test(line)) {
        scrollJumps.push({ file: fileRel, line: lineNo, kind: 'scroll-into-view', snippet: trimmed.slice(0, 200) });
      }
      if (/\bwindow\.scrollTo\s*\(|\bdocument\.(?:body|documentElement)\.scrollTop\s*=/.test(line)) {
        scrollJumps.push({ file: fileRel, line: lineNo, kind: 'scroll-to', snippet: trimmed.slice(0, 200) });
      }

      // UI/UX: suspicious navigation (low-noise heuristic)
      const suspiciousHtmlRe = /(href\s*=\s*["']([^"']+\.html)(?:["']))/gi;
      let sh;
      while ((sh = suspiciousHtmlRe.exec(line)) !== null) {
        const url = (sh[2] || '').trim();
        if (!url || url.includes('?') || /index\.html$/i.test(url)) continue;
        suspiciousNavigation.push({ file: fileRel, line: lineNo, snippet: trimmed.slice(0, 200) });
      }
      const suspiciousLocHrefRe = /(location\.href\s*=\s*[`"']([^`"']+\.html)(?:[`"']))/gi;
      let sl;
      while ((sl = suspiciousLocHrefRe.exec(line)) !== null) {
        const url = (sl[2] || '').trim();
        if (!url || url.includes('?') || /index\.html$/i.test(url)) continue;
        suspiciousNavigation.push({ file: fileRel, line: lineNo, snippet: trimmed.slice(0, 200) });
      }
      const suspiciousOpenRe = /(window\.open\s*\(\s*[`"']([^`"']+\.html)(?:[`"']))/gi;
      let so;
      while ((so = suspiciousOpenRe.exec(line)) !== null) {
        const url = (so[2] || '').trim();
        if (!url || url.includes('?') || /index\.html$/i.test(url)) continue;
        suspiciousNavigation.push({ file: fileRel, line: lineNo, snippet: trimmed.slice(0, 200) });
      }

      // window.open / location.href with template/string literals
      const urlRe = /(?:window\.open|location\.href)\s*[=(][`'"]([^`'"]*invoice\.html[^`'"]*)[`'"]/g;
      let um;
      while ((um = urlRe.exec(line)) !== null) {
        const url = um[1];
        const params = {};
        const paramRe = /([a-zA-Z]+)=([^&`'"\s]+)/g;
        let pm;
        while ((pm = paramRe.exec(url)) !== null) params[pm[1]] = pm[2];
        invoiceOpenCalls.push({ file: fileRel, line: i + 1, url, params, via: 'js' });
      }
      // anchor href= pointing to invoice.html
      const hrefRe = /href\s*=\s*["']([^"']*invoice\.html[^"']*)['"]/g;
      let hm;
      while ((hm = hrefRe.exec(line)) !== null) {
        const url = hm[1];
        const params = {};
        const paramRe2 = /([a-zA-Z]+)=([^&"'\s]+)/g;
        let pm2;
        while ((pm2 = paramRe2.exec(url)) !== null) params[pm2[1]] = pm2[2];
        invoiceOpenCalls.push({ file: fileRel, line: i + 1, url, params, via: 'href' });
      }
      // openInvoice* function calls
      const fnRe = /(openInvoice|openInvoiceFile|openInvoiceForAppointment|openInvoiceFromAppointment|openInvoicePage)\s*\(/g;
      let fm;
      while ((fm = fnRe.exec(line)) !== null) {
        invoiceFunctionCalls.push({ file: fileRel, line: i + 1, fnName: fm[1] });
      }
    });

    // ── invoice number generators ──
    lines.forEach((line, i) => {
      if (
        /function\s+generate[A-Za-z]*[Ii]nvoice[Nn]um/i.test(line) ||
        /generate[A-Za-z]*[Ii]nvoice[Nn]um[a-z]*/i.test(line)
      ) {
        if (/function\s+/i.test(line) || /const\s+generate|let\s+generate/i.test(line)) {
          const nm = /(generate[A-Za-z]*(?:invoice|inv)[A-Za-z]*(?:number|num)?)/i.exec(line);
          if (nm) invoiceNumGenerators.push({ file: fileRel, line: i + 1, fnName: nm[1] });
        }
      }
    });

    // ── duplicate function names ──
    const funcRe = /(?:^|\s)function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
    let dm;
    while ((dm = funcRe.exec(source)) !== null) {
      const fn = dm[1];
      if (!duplicateFnNames[fn]) duplicateFnNames[fn] = [];
      const lineNum = source.slice(0, dm.index).split('\n').length;
      duplicateFnNames[fn].push({ file: fileRel, line: lineNum });
    }
  }

  // ─── POST-PROCESS ───────────────────────────────────────────────────────────

  // Identify stub/noop window functions
  const stubFunctions = new Set([...stubOnInits]);
  for (const [fn, defs] of Object.entries(windowExports)) {
    if (defs.some(d => d.isNoop || d.isStub)) stubFunctions.add(fn);
  }

  // Broken wiring candidates — split into REAL vs likely false positive
  const missingDataId = actionIdPairs.filter(p => !p.hasDataId || p.idEmpty);
  // REAL: item-scoped action in a non-exempt file — needs data-id for bindActionDelegation
  const realMissingDataId = missingDataId.filter(p => p.isItemScoped && !p.isExempt);
  // LIKELY FALSE POSITIVE: not-item-scoped, or in exempt files (modals, invoice.html, chips)
  const fpMissingDataId = missingDataId.filter(p => !p.isItemScoped || p.isExempt);

  const onclickCallsStub = windowCallsFromOnclick.filter(c => stubFunctions.has(c.callee));

  // window functions called from onclick that have no definition at all
  const undefinedWindowCalls = windowCallsFromOnclick.filter(c => {
    const defs = windowExports[c.callee] || [];
    return defs.length === 0;
  });

  // data-action values not mapped to any handler string in JS
  const allJsSources = files
    .filter(f => f.endsWith('.js') || f.endsWith('.mjs'))
    .map(f => ({ rel: rel(f), src: fs.readFileSync(f, 'utf8') }));

  const unmappedActions = [];
  for (const action of Object.keys(dataActionCounts)) {
    const mapped = allJsSources.some(({ src }) =>
      src.includes(`'${action}'`) || src.includes(`"${action}"`) || src.includes(`\`${action}\``)
    );
    if (!mapped) {
      const parts = action.split('-');
      const prefix = parts[0];
      const isDynamic = allJsSources.some(({ src }) =>
        src.includes(`data-action="add-\${`) ||
        src.includes(`data-action=\`add-\${`) ||
        src.includes(`[data-action="${prefix}-\${`)
      );
      if (!isDynamic) unmappedActions.push(action);
    }
  }

  // Duplicate functions
  const realDuplicates = Object.entries(duplicateFnNames)
    .filter(([, locs]) => locs.length > 1)
    .map(([fn, locs]) => ({ fn, locs }));

  // Invoice param fingerprints
  const invoiceParamSets = invoiceOpenCalls.map(c => Object.keys(c.params).sort().join(','));
  const uniqueParamSets = [...new Set(invoiceParamSets)];

  // Invoice violations: direct URL opens with non-canonical params or missing invoiceId
  const invoiceViolations = invoiceOpenCalls.filter(c => {
    const keys = Object.keys(c.params);
    const hasInvalidKey = keys.some(k => INVALID_INVOICE_KEYS.has(k));
    const missingInvoiceId = keys.length > 0 && !keys.includes('invoiceId');
    return hasInvalidKey || missingInvoiceId;
  });

  // High-risk duplicate functions (invoice/wiring-critical names only)
  const highRiskDuplicates = realDuplicates.filter(({ fn }) => HIGH_RISK_DUPLICATE_NAMES.has(fn));
  const uniqueDeadButtons = [];
  const deadSeen = new Set();
  for (const item of deadButtons) {
    const key = `${item.file}::${item.tagSnippet}`;
    if (deadSeen.has(key)) continue;
    deadSeen.add(key);
    uniqueDeadButtons.push(item);
  }
  const uniqueScrollJumps = [];
  const scrollSeen = new Set();
  for (const item of scrollJumps) {
    const key = `${item.file}:${item.line}:${item.kind}:${item.snippet}`;
    if (scrollSeen.has(key)) continue;
    scrollSeen.add(key);
    uniqueScrollJumps.push(item);
  }
  const uniqueSuspiciousNavigation = [];
  const navSeen = new Set();
  for (const item of suspiciousNavigation) {
    const key = `${item.file}:${item.line}:${item.snippet}`;
    if (navSeen.has(key)) continue;
    navSeen.add(key);
    uniqueSuspiciousNavigation.push(item);
  }

  // ─── COUNTS ───────────────────────────────────────────────────────────────────
  const realBrokenCount = realMissingDataId.length + onclickCallsStub.length +
    undefinedWindowCalls.length + unmappedActions.length + invoiceViolations.length;
  const fpCount = fpMissingDataId.length;
  const totalControls = actionIdPairs.length + onclickHandlers.length;
  const wiringPct = totalControls > 0
    ? Math.round(((totalControls - realBrokenCount) / totalControls) * 100)
    : 0;

  // ─── BUILD JSON REPORT ───────────────────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    totalFilesScanned: files.length,
    summary: {
      realBrokenCandidates: realBrokenCount,
      likelyFalsePositives: fpCount,
      unmappedActions: unmappedActions.length,
      invoiceViolations: invoiceViolations.length,
      highRiskDuplicates: highRiskDuplicates.length,
      wiringCompletenessEstimate: `~${wiringPct}%`
    },
    onclickHandlers: {
      total: onclickHandlers.length,
      items: onclickHandlers
    },
    dataAction: {
      uniqueActions: Object.keys(dataActionCounts).length,
      counts: dataActionCounts,
      realMissingDataId: { total: realMissingDataId.length, items: realMissingDataId },
      fpMissingDataId: { total: fpMissingDataId.length, items: fpMissingDataId },
      unmappedToHandler: unmappedActions
    },
    eventWiring: {
      addEventListenerClickCount: addEventListenerClicks.length,
      closestDelegationCount: closestDelegations.length,
      closestDelegations
    },
    windowExports: {
      total: Object.keys(windowExports).length,
      stubFunctions: [...stubFunctions],
      all: windowExports
    },
    onclickWindowCalls: {
      total: windowCallsFromOnclick.length,
      callsToStubs: onclickCallsStub,
      callsToUndefined: undefinedWindowCalls
    },
    invoiceFlows: {
      directOpens: invoiceOpenCalls,
      violations: invoiceViolations,
      functionCalls: invoiceFunctionCalls,
      invoiceNumberGenerators: invoiceNumGenerators,
      uniqueParamSets,
      canonicalContract: 'invoice.html?invoiceId=<firestoreDocId>&mode=<view|edit>'
    },
    duplicateFunctions: {
      highRisk: highRiskDuplicates,
      all: realDuplicates.slice(0, 30)
    },
    uiUxBugs: {
      deadButtons: {
        total: uniqueDeadButtons.length,
        items: uniqueDeadButtons
      },
      scrollJumps: {
        total: uniqueScrollJumps.length,
        items: uniqueScrollJumps
      },
      suspiciousNavigation: {
        total: uniqueSuspiciousNavigation.length,
        items: uniqueSuspiciousNavigation.slice(0, 30)
      }
    }
  };

  // ─── BUILD MARKDOWN REPORT ───────────────────────────────────────────────────
  const md = buildMarkdown(report, {
    realMissingDataId,
    fpMissingDataId,
    onclickCallsStub,
    undefinedWindowCalls,
    unmappedActions,
    invoiceViolations,
    invoiceOpenCalls,
    invoiceFunctionCalls,
    invoiceNumGenerators,
    highRiskDuplicates,
    realDuplicates,
    closestDelegations,
    stubFunctions,
    windowExports,
    onclickHandlers,
    dataActionCounts,
    uniqueParamSets,
    uiUxBugs: report.uiUxBugs
  });

  // ─── WRITE OUTPUT ─────────────────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'audit-report.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'audit-report.md'), md, 'utf8');

  console.log(`\n✅  Audit complete. Files scanned: ${files.length}`);
  console.log(`    audit/audit-report.json`);
  console.log(`    audit/audit-report.md`);
  console.log(`\n🔴  REAL broken wiring candidates: ${realBrokenCount}  (target: 0)`);
  console.log(`🔵  Likely false positives (informational): ${fpCount}`);
  console.log(`🟡  Unmapped data-action values: ${unmappedActions.length}  (target: 0)`);
  console.log(`🟠  Invoice param violations: ${invoiceViolations.length}  (target: 0)`);
  console.log(`🔁  High-risk duplicate functions: ${highRiskDuplicates.length}`);
  console.log(`🧩 UI/UX dead buttons: ${report.uiUxBugs.deadButtons.total}`);
  console.log(`🧭 UI/UX scroll-jumps: ${report.uiUxBugs.scrollJumps.total}`);
  console.log(`🚦 UI/UX suspicious navigation: ${report.uiUxBugs.suspiciousNavigation.total}`);
  console.log(`\n  → See audit/audit-report.md for full actionable details.\n`);
}

// ─── MARKDOWN BUILDER ────────────────────────────────────────────────────────
function buildMarkdown(report, {
  realMissingDataId, fpMissingDataId,
  onclickCallsStub, undefinedWindowCalls, unmappedActions,
  invoiceViolations, invoiceOpenCalls, invoiceFunctionCalls, invoiceNumGenerators,
  highRiskDuplicates, realDuplicates,
  closestDelegations, stubFunctions, windowExports, onclickHandlers,
  dataActionCounts, uniqueParamSets, uiUxBugs
}) {
  const lines = [];
  const h1 = s => lines.push(`# ${s}\n`);
  const h2 = s => lines.push(`## ${s}\n`);
  const h3 = s => lines.push(`### ${s}\n`);
  const p = s => lines.push(`${s}\n`);
  const li = s => lines.push(`- ${s}`);
  const nl = () => lines.push('');
  const table = (headers, rows) => {
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    rows.forEach(row => lines.push('| ' + row.join(' | ') + ' |'));
    nl();
  };

  const sm = report.summary;

  h1('Wiring Audit Report');
  p(`_Generated: ${report.generatedAt} — files scanned: ${report.totalFilesScanned}_`);
  p('> **Definition of Done:** Real broken candidates = 0 · Unmapped actions = 0 · Invoice violations = 0 · Runtime smoke test passes');

  // ── SECTION 1: Summary metrics ───────────────────────────────────────────────
  h2('1. Summary Metrics');
  table(
    ['Metric', 'Count', 'Target', 'Status'],
    [
      ['🔴 REAL broken wiring candidates', String(sm.realBrokenCandidates), '0',
        sm.realBrokenCandidates === 0 ? '✅' : '❌ Fix required'],
      ['🔵 Likely false positives (informational)', String(sm.likelyFalsePositives), '—', 'ℹ️ Review if needed'],
      ['🟡 Unmapped data-action values', String(sm.unmappedActions), '0',
        sm.unmappedActions === 0 ? '✅' : '❌ Fix required'],
      ['🟠 Invoice param violations', String(sm.invoiceViolations), '0',
        sm.invoiceViolations === 0 ? '✅' : '❌ Fix required'],
      ['🔁 High-risk duplicate functions (informational)', String(sm.highRiskDuplicates), '—', 'ℹ️ Review if needed'],
      ['Wiring completeness estimate', sm.wiringCompletenessEstimate, '100%', ''],
    ]
  );
  const totalControlCount = report.onclickHandlers.total + Object.values(dataActionCounts).reduce((a, b) => a + b, 0);
  p(`**Total controls:** ${totalControlCount}  |  **unique data-action values:** ${Object.keys(dataActionCounts).length}  |  **inline onclick:** ${report.onclickHandlers.total}  |  **window.* exports:** ${Object.keys(windowExports).length}`);
  nl();

  // ── SECTION 2: REAL Issues ────────────────────────────────────────────────────
  h2('2. REAL Issues — Fix These (ranked by impact)');
  p('These are the only items that need to be fixed. Each entry includes: file, action/expression, why it breaks, minimal fix.');
  nl();

  // 2a: item-scoped missing data-id
  h3('2a. Item-scoped data-action missing data-id');
  p(`Count: **${realMissingDataId.length}**`);
  p('**Why it breaks:** `bindActionDelegation` (src/core/events.js) uses `closest("[data-action][data-id]")` — missing `data-id` means the click is silently swallowed.');
  p('**Minimal fix:** Add `data-id="${entity.id}"` (or `data-id="${apt.id}"`) to every rendering template that contains the buttons listed below.');
  nl();
  if (realMissingDataId.length) {
    table(
      ['File', 'Action', 'Snippet (truncated)'],
      realMissingDataId.slice(0, 40).map(r => [
        r.file, r.action,
        '`' + (r.snippet || '').slice(0, 90).replace(/`/g, "'") + '`'
      ])
    );
    p('**Search commands:**');
    p('```');
    p('rg "data-action" -n src/data-layer/');
    p('rg "data-action" -n src/invoices/');
    p('```');
  } else {
    p('✅ None found.');
  }

  // 2b: onclick → stub
  h3('2b. onclick calls stub/no-op window functions');
  p(`Count: **${onclickCallsStub.length}**`);
  p('**Why it breaks:** The function body is empty or a no-op — the click fires but nothing happens.');
  p(`Known stubs: ${[...stubFunctions].map(f => `\`window.${f}\``).join(', ') || 'none'}`);
  if (onclickCallsStub.length) {
    table(
      ['File', 'Line', 'onclick Expression', 'Stub Called', 'Where real fn lives'],
      onclickCallsStub.slice(0, 30).map(r => {
        const realDefs = (windowExports[r.callee] || []).filter(d => !d.isNoop && !d.isStub);
        const realFile = realDefs.length ? realDefs[0].file : '— not found';
        return [r.file, String(r.line), r.caller.slice(0, 60), r.callee, realFile];
      })
    );
  } else {
    p('✅ None — stubs are overridden by real implementations before any click can fire.');
  }

  // 2c: onclick → undefined
  h3('2c. onclick calls window function with NO definition');
  p(`Count: **${undefinedWindowCalls.length}**`);
  p('**Why it breaks:** The function does not exist at all — calling it throws `TypeError: window.fn is not a function`.');
  if (undefinedWindowCalls.length) {
    table(
      ['File', 'Line', 'Expression', 'Missing Function'],
      undefinedWindowCalls.slice(0, 20).map(r => [r.file, String(r.line), r.caller.slice(0, 60), r.callee])
    );
    p('**Search command:** `rg "window\\." -n script.js src/`');
  } else {
    p('✅ None found.');
  }

  // 2d: unmapped data-actions
  h3('2d. data-action values not matched by any handler string in JS');
  p(`Count: **${unmappedActions.length}**`);
  p('**Why it breaks:** The delegation fires and matches the element, but no `case`/`if` branch handles the action string — click silently does nothing.');
  if (unmappedActions.length) {
    unmappedActions.forEach(a => li(`\`${a}\` — add a handler branch in the relevant delegation block`));
    nl();
    p('**Search command:** `rg "data-action" -n` then trace each action value to its JS handler.');
  } else {
    p('✅ All data-action values found as strings in JS source.');
  }

  // ── SECTION 3: Invoice Contract + Violations ─────────────────────────────────
  h2('3. Invoice Contract & Violations');

  h3('3a. Canonical contract');
  p('```');
  p('invoice.html?invoiceId=<firestoreDocId>&mode=<view|edit>');
  p('```');
  p('- `invoiceId` = Firestore document id — **required**');
  p('- `mode` = `view` (default) or `edit`');
  p('- `aptId`, `appointmentId`, `id` must **never** appear in the URL — resolve to `invoiceId` first');
  p('- All opens go through `openInvoicePage(invoiceId, mode)` in `src/invoices/invoice-manager.js`');
  nl();

  h3('3b. Violations found (non-canonical params)');
  p(`Count: **${invoiceViolations.length}**  (target: 0)`);
  if (invoiceViolations.length) {
    p('> **For each violation:** replace the direct URL build with `openInvoicePage(invoiceId, mode)` or `openInvoice(null, invoiceId, mode)`.');
    nl();
    table(
      ['File', 'Line', 'Via', 'Params used', 'Problem', 'Fix'],
      invoiceViolations.map(c => {
        const keys = Object.keys(c.params);
        const badKeys = keys.filter(k => INVALID_INVOICE_KEYS.has(k));
        const missingId = !keys.includes('invoiceId');
        const problem = [
          ...badKeys.map(k => `has \`${k}=\``),
          ...(missingId ? ['missing `invoiceId=`'] : [])
        ].join('; ');
        return [
          c.file, String(c.line), c.via || 'js',
          keys.map(k => `${k}=…`).join('&') || c.url.slice(0, 60),
          problem,
          'Use `openInvoicePage(id, mode)`'
        ];
      })
    );
  } else {
    p('✅ No violations — all detected direct opens use canonical params.');
  }

  h3('3c. All invoice.html entry points detected');
  p('**Search command:** `rg "invoice.html\\?" -n`');
  nl();
  if (invoiceOpenCalls.length) {
    table(
      ['File', 'Line', 'Via', 'Params'],
      invoiceOpenCalls.map(c => [
        c.file, String(c.line), c.via || 'js',
        Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(', ') || c.url.slice(0, 70)
      ])
    );
  } else {
    p('None found via static scan.');
  }

  h3('3d. openInvoice* function call sites');
  p('**Search command:** `rg "openInvoice" -n src/`');
  nl();
  if (invoiceFunctionCalls.length) {
    table(
      ['File', 'Line', 'Function'],
      invoiceFunctionCalls.map(c => [c.file, String(c.line), c.fnName])
    );
  } else {
    p('None found.');
  }

  h3('3e. Invoice number generators (duplicate risk)');
  if (invoiceNumGenerators.length > 1) {
    p(`⚠️  ${invoiceNumGenerators.length} definitions found — keep only the canonical one in \`src/invoices/invoice-manager.js\`.`);
    table(['File', 'Line', 'Function'], invoiceNumGenerators.map(g => [g.file, String(g.line), g.fnName]));
  } else if (invoiceNumGenerators.length === 1) {
    p(`✅ Single generator in \`${invoiceNumGenerators[0].file}\`.`);
  } else {
    p('None found via heuristic scan.');
  }

  // ── SECTION 4: Likely false positives ────────────────────────────────────────
  h2('4. Likely False Positives — Do NOT Fix Unless Proven');
  p('These items were flagged by the element scanner but are expected behavior in this repo.');
  p('Verify before making any changes to items listed here.');
  nl();

  h3('4a. Non-item-scoped or exempt-file data-action missing data-id');
  p(`Count: **${fpMissingDataId.length}**`);
  p('These live in: modal dialogs, invoice.html, chips / search / filter controls, offline.html.');
  p('They use *local* event delegation that only needs `data-action` (no `data-id` required).');
  if (fpMissingDataId.length) {
    table(
      ['File', 'Action', 'Why likely OK'],
      fpMissingDataId.slice(0, 40).map(r => [
        r.file, r.action,
        r.isExempt ? 'Exempt file (local delegation, no bindActionDelegation)' : 'Non-item-scoped action (global/filter/chip)'
      ])
    );
  } else {
    p('None.');
  }

  h3('4b. Invoice param set patterns observed');
  uniqueParamSets.forEach((s, i) => li(`Variant ${i + 1}: \`${s || '(no params)'}\``));
  if (uniqueParamSets.length <= 1) { nl(); p('✅ Single canonical param set in use.'); }
  nl();

  // ── SECTION 5: High-risk duplicate functions ──────────────────────────────────
  h2('5. High-Risk Duplicate Functions — Review Required');
  p('Only invoice/wiring-critical function names are flagged here. The full duplicate list is in Appendix D.');
  p('A duplicate here means two files define the same critical function independently — risk of format drift or split behaviour.');
  nl();
  if (highRiskDuplicates.length) {
    highRiskDuplicates.forEach(({ fn, locs }) => {
      h3(`\`${fn}\``);
      p(`Defined in **${locs.length} places:**`);
      locs.forEach(l => li(`${l.file}:${l.line}`));
      p('**Action:** Confirm only `src/invoices/invoice-manager.js` holds the canonical definition; all others must import from it.');
      nl();
    });
  } else {
    p('✅ No high-risk duplicate functions found.');
  }

  // ── SECTION 6: UI/UX Bugs ───────────────────────────────────────────────────
  h2('6. UI/UX Bugs (scroll-jump, dead buttons)');
  p('Static heuristic checks for no-op controls and unexpected scroll/navigation triggers.');
  p(`Dead buttons: **${uiUxBugs.deadButtons.total}** · Scroll-jumps: **${uiUxBugs.scrollJumps.total}** · Suspicious navigation: **${uiUxBugs.suspiciousNavigation.total}**`);
  nl();

  h3('6a. Dead Buttons');
  p('Controls that look interactive (by class naming) but have no `data-action`, `onclick`, or `href`.');
  if (uiUxBugs.deadButtons.total) {
    table(
      ['File', 'Snippet'],
      uiUxBugs.deadButtons.items.slice(0, 40).map(r => [
        escapeMdCell(r.file),
        '`' + escapeMdCell((r.tagSnippet || '').slice(0, 160).replace(/`/g, "'")) + '`'
      ])
    );
  } else {
    p('✅ None found.');
    nl();
  }

  h3('6b. Scroll Jumps');
  p('Patterns that may trigger unexpected jump/scroll behavior (`href="#..."`, `location.hash=`, `scrollIntoView`, `scrollTo`).');
  if (uiUxBugs.scrollJumps.total) {
    table(
      ['File', 'Line', 'Kind', 'Snippet'],
      uiUxBugs.scrollJumps.items.slice(0, 40).map(r => [
        escapeMdCell(r.file),
        String(r.line || ''),
        escapeMdCell(r.kind || ''),
        '`' + escapeMdCell((r.snippet || '').slice(0, 140).replace(/`/g, "'")) + '`'
      ])
    );
  } else {
    p('✅ None found.');
    nl();
  }

  h3('6c. Suspicious Navigation');
  p('Navigation to `.html` routes without query params (excluding `index.html`) that may miss required context.');
  if (uiUxBugs.suspiciousNavigation.total) {
    table(
      ['File', 'Line', 'Snippet'],
      uiUxBugs.suspiciousNavigation.items.slice(0, 30).map(r => [
        escapeMdCell(r.file),
        String(r.line || ''),
        '`' + escapeMdCell((r.snippet || '').slice(0, 150).replace(/`/g, "'")) + '`'
      ])
    );
  } else {
    p('✅ None found.');
    nl();
  }

  // ── APPENDIX A ──────────────────────────────────────────────────────────────
  h2('Appendix A: All data-action values and occurrence counts');
  table(
    ['Action', 'Occurrences'],
    Object.entries(dataActionCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])
  );

  // ── APPENDIX B ──────────────────────────────────────────────────────────────
  h2('Appendix B: All window.* exports');
  table(
    ['Function', 'Definition File(s)', 'Stub?', 'Noop?'],
    Object.entries(windowExports).map(([fn, defs]) => [
      `window.${fn}`,
      [...new Set(defs.map(d => d.file))].join(', '),
      defs.some(d => d.isStub) ? '⚠️ yes' : 'no',
      defs.some(d => d.isNoop) ? '⚠️ yes' : 'no'
    ])
  );

  // ── APPENDIX C ──────────────────────────────────────────────────────────────
  h2('Appendix C: Closest-delegation sites (data-action dispatch points)');
  closestDelegations.forEach(c => li(`${c.file}:${c.line} — \`${c.snippet}\``));
  nl();

  // ── APPENDIX D ──────────────────────────────────────────────────────────────
  h2('Appendix D: All duplicate function names (first 20)');
  p('Most duplicates are benign utility names. High-risk ones are covered in Section 5.');
  if (realDuplicates.length) {
    realDuplicates.slice(0, 20).forEach(({ fn, locs }) => {
      li(`\`${fn}\` — ${locs.map(l => `${l.file}:${l.line}`).join(', ')}`);
    });
    nl();
  } else {
    p('None found.');
  }

  return lines.join('\n');
}

// ─── RUN ─────────────────────────────────────────────────────────────────────
audit();

