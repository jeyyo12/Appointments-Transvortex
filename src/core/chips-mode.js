/**
 * Chips Mode Manager - Premium UI for Jobs & Parts
 * Typeahead search, custom items, chips display, totals calculation
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger('ChipsMode');

// Preset data for jobs and parts
const PRESETS = {
  jobs: [
    'Air Conditioning Service',
    'Brake Fluid Flush',
    'Oil Change',
    'Filter Replacement',
    'Coolant Flush',
    'Transmission Service',
    'Wheel Alignment',
    'Diagnostic Scan',
    'Battery Replacement',
    'Tire Rotation',
    'Inspection',
    'Custom Service'
  ],
  parts: [
    'Oil Filter',
    'Air Filter',
    'Cabin Air Filter',
    'Brake Pads',
    'Spark Plugs',
    'Battery',
    'Wiper Blades',
    'Coolant',
    'Brake Fluid',
    'Transmission Fluid',
    'Engine Oil (5L)',
    'Engine Oil (10L)'
  ]
};

// State management for chips
const chipsState = {
  jobs: [],
  parts: []
};

// Auto-save debounce timer
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 1500; // 1.5 seconds

// Auto-save callback (set by external code)
let autoSaveCallback = null;

// Firestore db reference (set by external code)
let firestoreDb = null;

/**
 * Set auto-save callback function
 * @param {Function} callback - Function to call when auto-save triggers
 */
export function setAutoSaveCallback(callback) {
  autoSaveCallback = callback;
  logger.info('Auto-save callback registered');
}

/**
 * Set Firestore database reference for catalog persistence
 * @param {Object} db - Firestore database instance
 */
export function setFirestoreDb(db) {
  firestoreDb = db;
  logger.info('Firestore DB reference set for catalog');
}

/**
 * Trigger auto-save with debounce
 */
function triggerAutoSave() {
  if (!autoSaveCallback) return;
  
  // Clear existing timer
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  // Set new timer
  autoSaveTimer = setTimeout(() => {
    logger.info('🔄 Auto-save triggered');
    try {
      autoSaveCallback();
    } catch (err) {
      logger.error('Auto-save failed:', err);
    }
  }, AUTO_SAVE_DELAY);
}

/**
 * Persist item to Firestore catalog
 * Creates new entry or increments usage count for existing items
 * @param {string} text - Formatted item text
 * @param {string} kind - 'job' or 'part'
 */
async function persistToCatalog(text, kind) {
  if (!firestoreDb) {
    logger.debug('Catalog persistence skipped - no DB reference');
    return;
  }
  
  try {
    const { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, increment } = 
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    const type = kind === 'job' ? 'labour' : 'part';
    const normalized = text.toLowerCase().trim();
    
    // Check if item already exists
    const catalogRef = collection(firestoreDb, 'invoiceCatalog');
    const q = query(
      catalogRef,
      where('type', '==', type),
      where('normalized', '==', normalized)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      // Item exists - increment usage count
      const existingDoc = snapshot.docs[0];
      await updateDoc(doc(firestoreDb, 'invoiceCatalog', existingDoc.id), {
        usageCount: increment(1),
        updatedAt: serverTimestamp()
      });
      logger.debug(`📈 Catalog: Incremented "${text}" (${type})`);
    } else {
      // New item - create entry
      await addDoc(catalogRef, {
        type,
        text,
        normalized,
        usageCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      logger.debug(`✨ Catalog: Created "${text}" (${type})`);
    }
  } catch (err) {
    logger.error('Catalog persistence failed:', err);
  }
}

/**
 * Initialize Chips Mode for a given kind (job or part)
 */
export function initChipsMode(kind) {
  const isJob = kind === 'job';
  const searchInputId = isJob ? 'jobSearchInput' : 'partSearchInput';
  const suggestBoxId = isJob ? 'jobSuggestBox' : 'partSuggestBox';
  const chipsListId = isJob ? 'jobsChips' : 'partsChips';
  const addBtnSelector = `[data-action="add-${kind}"]`;
  const countId = isJob ? 'jobsCount' : 'partsCount';

  const searchInput = document.getElementById(searchInputId);
  const suggestBox = document.getElementById(suggestBoxId);
  const chipsList = document.getElementById(chipsListId);
  const addBtn = document.querySelector(addBtnSelector);
  const countBadge = document.getElementById(countId);

  if (!searchInput || !suggestBox || !chipsList || !addBtn) {
    logger.warn(`Chips mode elements not found for ${kind}`);
    return;
  }

  // Typeahead on input change
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    handleTypeahead(query, kind, suggestBox, searchInput);
  });

  // Format to Title Case on blur
  searchInput.addEventListener('blur', (e) => {
    const text = e.target.value.trim();
    if (text) {
      e.target.value = toTitleCaseSmart(text);
    }
    
    // Close dropdown after short delay
    setTimeout(() => {
      suggestBox.classList.remove('open');
      suggestBox.innerHTML = '';
    }, 150);
  });

  // Add button click
  addBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      addChip(query, kind, searchInput, chipsList, countBadge);
    }
  });

  // Enter key to add
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) {
        addChip(query, kind, searchInput, chipsList, countBadge);
      }
    }
  });

  // Event delegation for chip controls (live updates)
  chipsList.addEventListener('input', (e) => {
    if (e.target.classList.contains('chipQty') || e.target.classList.contains('chipPrice')) {
      const chipEl = e.target.closest('.chipItem');
      if (chipEl) {
        recalcChipRow(chipEl, kind);
        recalcAllTotals();
        triggerAutoSave(); // Auto-save when qty/price changes
      }
    }
  });

  chipsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('chipRemove')) {
      const chip = e.target.closest('.chipItem');
      removeChip(chip, kind);
      recalcAllTotals();
      triggerAutoSave(); // Auto-save when item removed
    }
  });

  logger.info(`✅ Chips mode initialized for ${kind}s`);
}

/**
 * Handle typeahead suggestions (with catalog integration)
 */
async function handleTypeahead(query, kind, suggestBox, searchInput) {
  if (!query) {
    suggestBox.classList.remove('open');
    return;
  }

  const type = kind === 'job' ? 'labour' : 'part';
  let catalogItems = [];
  
  // Query catalog if db is available
  if (firestoreDb) {
    try {
      const { collection, query: firestoreQuery, where, orderBy, limit, getDocs } = 
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const catalogRef = collection(firestoreDb, 'invoiceCatalog');
      const normalized = query.toLowerCase();
      
      // Query items that start with the search term
      const q = firestoreQuery(
        catalogRef,
        where('type', '==', type),
        where('normalized', '>=', normalized),
        where('normalized', '<', normalized + '\uf8ff'),
        orderBy('normalized'),
        orderBy('usageCount', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      catalogItems = snapshot.docs.map(doc => doc.data().text);
    } catch (err) {
      logger.debug('Catalog query failed:', err);
    }
  }
  
  // Get preset matches
  const presets = PRESETS[kind === 'job' ? 'jobs' : 'parts'];
  const presetMatches = presets.filter(item => 
    item.toLowerCase().includes(query) && 
    item.toLowerCase() !== query
  );

  let html = '';
  
  // Show catalog suggestions first (most relevant)
  if (catalogItems.length > 0) {
    catalogItems.forEach(item => {
      html += `<div class="suggestItem catalog-item" data-value="${escapeHtml(item)}">
        <span class="suggest-icon">⭐</span> ${highlightMatch(item, query)}
      </div>`;
    });
  }

  // Show preset matches
  presetMatches.slice(0, 3).forEach(match => {
    // Don't duplicate catalog items
    if (!catalogItems.includes(match)) {
      html += `<div class="suggestItem" data-value="${escapeHtml(match)}">${highlightMatch(match, query)}</div>`;
    }
  });

  // Add "Create new" option if query doesn't match existing items
  const allItems = [...catalogItems, ...presets];
  const exactMatch = allItems.some(item => item.toLowerCase() === query.toLowerCase());
  
  if (!exactMatch) {
    const formattedQuery = toTitleCaseSmart(query);
    html += `<div class="suggestItem suggestAdd" data-value="${escapeHtml(formattedQuery)}">➕ Add new: <strong>${escapeHtml(formattedQuery)}</strong></div>`;
  }

  suggestBox.innerHTML = html;
  suggestBox.classList.add('open');

  // Attach click handlers to suggestions
  suggestBox.querySelectorAll('.suggestItem').forEach(item => {
    item.addEventListener('click', () => {
      searchInput.value = item.dataset.value;
      suggestBox.classList.remove('open');
      // Trigger add after short delay
      setTimeout(() => searchInput.dispatchEvent(new Event('blur')), 50);
    });
  });
}

/**
 * Add a chip to the list
 */
function addChip(label, kind, searchInput, chipsList, countBadge) {
  const isJob = kind === 'job';
  const id = `${kind}-${Date.now()}`;
  
  // Format label to Title Case
  const formattedLabel = toTitleCaseSmart(label.trim());
  
  // Create chip data
  const chip = {
    id,
    label: formattedLabel,
    qty: 1,
    price: 0,
    kind
  };

  // Add to state
  chipsState[isJob ? 'jobs' : 'parts'].push(chip);

  // Render chip
  renderChip(chip, chipsList, kind);

  // Update count
  const count = chipsState[isJob ? 'jobs' : 'parts'].length;
  countBadge.textContent = count;

  // Clear input
  searchInput.value = '';
  searchInput.focus();

  // Update totals
  recalcAllTotals();
  
  // Trigger auto-save
  triggerAutoSave();

  // Persist to catalog (async, don't wait)
  persistToCatalog(formattedLabel, kind);

  logger.info(`✅ Added ${kind}: "${formattedLabel}"`);
}

/**
 * Render a single chip
 */
function renderChip(chip, chipsList, kind) {
  const chipEl = document.createElement('div');
  chipEl.className = 'chipItem';
  chipEl.dataset.kind = kind;
  chipEl.dataset.id = chip.id;

  chipEl.innerHTML = `
    <div class="chipTop">
      <b class="chipName">${escapeHtml(chip.label)}</b>
      <button class="chipRemove" type="button" title="Remove">✕</button>
    </div>

    <div class="chipBottom">
      <label>Qty
        <input class="chipQty" type="number" min="1" value="${chip.qty}" />
      </label>

      <label>£
        <input class="chipPrice" type="number" min="0" step="0.01" placeholder="0.00" value="${chip.price || ''}" />
      </label>

      <div class="chipTotal">${formatCurrencyGBP(chip.qty * chip.price)}</div>
    </div>
  `;

  chipsList.appendChild(chipEl);

  // Remove empty state class
  chipsList.classList.remove('empty');
}

/**
 * Update chip totals display on qty/price change
 */
function recalcChipRow(chipEl, kind) {
  const qtyInput = chipEl.querySelector('.chipQty');
  const priceInput = chipEl.querySelector('.chipPrice');
  const totalDisplay = chipEl.querySelector('.chipTotal');

  if (!qtyInput || !priceInput || !totalDisplay) return;

  const rawQty = qtyInput.value.trim();
  let qty = rawQty === '' ? 0 : parseInt(rawQty, 10);
  if (!Number.isFinite(qty)) qty = 0;
  if (rawQty !== '' && qty < 1) qty = 1;

  const rawPrice = priceInput.value.trim();
  let price = rawPrice === '' ? 0 : parseFloat(rawPrice);
  if (!Number.isFinite(price) || price < 0) price = 0;

  const total = qty * price;
  totalDisplay.textContent = formatCurrencyGBP(total);

  // Update state
  const id = chipEl.dataset.id;
  const isJob = kind === 'job';
  const items = chipsState[isJob ? 'jobs' : 'parts'];
  const item = items.find(i => i.id === id);
  if (item) {
    item.qty = qty;
    item.price = price;
  }
}

/**
 * Remove a chip
 */
function removeChip(chipEl, kind) {
  const id = chipEl.dataset.id;
  const isJob = kind === 'job';
  const items = chipsState[isJob ? 'jobs' : 'parts'];
  const index = items.findIndex(i => i.id === id);
  
  if (index > -1) {
    items.splice(index, 1);
  }

  chipEl.remove();

  // Update count
  const countId = isJob ? 'jobsCount' : 'partsCount';
  const countBadge = document.getElementById(countId);
  countBadge.textContent = items.length;

  // Show empty state if no items
  const chipListId = isJob ? 'jobsChips' : 'partsChips';
  const chipsList = document.getElementById(chipListId);
  if (items.length === 0) {
    chipsList.classList.add('empty');
  }

  logger.info(`🗑️ Removed ${kind}: ${id}`);
}

/**
 * Update totals display (labour + parts)
 */
function recalcAllTotals() {
  const labourSubtotal = chipsState.jobs.reduce((sum, job) => sum + (job.qty * job.price), 0);
  const partsSubtotal = chipsState.parts.reduce((sum, part) => sum + (part.qty * part.price), 0);
  const combined = labourSubtotal + partsSubtotal;

  const labourTargets = [
    document.getElementById('labourTotalValue'),
    document.getElementById('labourSubtotal')
  ].filter(Boolean);
  const partsTargets = [
    document.getElementById('partsTotalValue'),
    document.getElementById('partsSubtotal')
  ].filter(Boolean);
  const subtotalTargets = [
    document.getElementById('subtotalValue'),
    document.getElementById('combinedSubtotal')
  ].filter(Boolean);

  labourTargets.forEach(el => {
    el.textContent = formatCurrencyGBP(labourSubtotal);
  });
  partsTargets.forEach(el => {
    el.textContent = formatCurrencyGBP(partsSubtotal);
  });
  subtotalTargets.forEach(el => {
    el.textContent = formatCurrencyGBP(combined);
  });

  logger.debug(`Totals updated: Labour=${labourSubtotal}, Parts=${partsSubtotal}, Combined=${combined}`);
}

/**
 * Get current chips data for submission
 */
export function getChipsData() {
  return {
    jobs: chipsState.jobs.map(j => ({ name: j.label, qty: j.qty, price: j.price })),
    parts: chipsState.parts.map(p => ({ name: p.label, qty: p.qty, price: p.price }))
  };
}

/**
 * Populate chips from appointment data (for Edit mode)
 * @param {Array} jobs - Array of job objects with { name/description, qty, unitPrice/price }
 * @param {Array} parts - Array of part objects with { name/description, qty, unitPrice/price }
 */
export function populateChipsFromData(jobs = [], parts = []) {
  logger.info('[EDIT] Populating chips from appointment data', { jobs: jobs.length, parts: parts.length });
  
  // Clear existing chips
  chipsState.jobs = [];
  chipsState.parts = [];
  
  // Get container elements
  const jobsChipsList = document.getElementById('jobsChips');
  const partsChipsList = document.getElementById('partsChips');
  const jobsCountBadge = document.getElementById('jobsCount');
  const partsCountBadge = document.getElementById('partsCount');
  
  // Clear DOM
  if (jobsChipsList) jobsChipsList.innerHTML = '';
  if (partsChipsList) partsChipsList.innerHTML = '';
  
  // Add jobs
  jobs.forEach(job => {
    const label = job.name || job.description || '';
    if (!label.trim()) return;
    
    const chip = {
      id: `job-${Date.now()}-${Math.random()}`,
      label: label.trim(),
      qty: parseInt(job.qty, 10) || 1,
      price: parseFloat(job.unitPrice ?? job.price ?? 0) || 0,
      kind: 'job'
    };
    
    chipsState.jobs.push(chip);
    if (jobsChipsList) renderChip(chip, jobsChipsList, 'job');
  });
  
  // Add parts
  parts.forEach(part => {
    const label = part.name || part.description || '';
    if (!label.trim()) return;
    
    const chip = {
      id: `part-${Date.now()}-${Math.random()}`,
      label: label.trim(),
      qty: parseInt(part.qty, 10) || 1,
      price: parseFloat(part.unitPrice ?? part.price ?? 0) || 0,
      kind: 'part'
    };
    
    chipsState.parts.push(chip);
    if (partsChipsList) renderChip(chip, partsChipsList, 'part');
  });
  
  // Update count badges
  if (jobsCountBadge) jobsCountBadge.textContent = chipsState.jobs.length;
  if (partsCountBadge) partsCountBadge.textContent = chipsState.parts.length;
  
  // Update totals
  recalcAllTotals();
  
  logger.info('[EDIT] Chips populated successfully', { jobs: chipsState.jobs.length, parts: chipsState.parts.length });
}

/**
 * Helper: Convert to Title Case with smart rules
 * - Capitalizes first letter of significant words
 * - Keeps connector words lowercase: of, and, for, the, a, an, to, in, on, at, from, by, with
 * - Preserves all-caps tokens (BMW, NGK, OEM)
 * - Preserves tokens with digits (1.5dCi, 9000)
 * - Always capitalizes first word
 */
function toTitleCaseSmart(str) {
  if (!str || typeof str !== 'string') return '';
  
  const smallWords = ['of', 'and', 'for', 'the', 'a', 'an', 'to', 'in', 'on', 'at', 'from', 'by', 'with'];
  const words = str.trim().split(/\s+/);
  
  return words.map((word, index) => {
    // Preserve empty or single-char words
    if (!word || word.length === 0) return word;
    
    // Preserve all-caps tokens (BMW, NGK, OEM) - must be 2+ chars and all uppercase
    if (word === word.toUpperCase() && word.length > 1 && /^[A-Z]+$/.test(word)) {
      return word;
    }
    
    // Preserve tokens with digits (1.5dCi, 9000, 205/55r16)
    if (/\d/.test(word)) {
      return word;
    }
    
    // First word always capitalize
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    
    // Small connector words stay lowercase (unless first)
    if (smallWords.includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    
    // Regular words: capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Helper: Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Helper: Highlight matching text in suggestions
 */
function highlightMatch(text, query) {
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark style="background: #fef3c7; font-weight: 600;">$1</mark>');
}

/**
 * Helper: Format currency
 */
function formatCurrencyGBP(value) {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const num = Number(value);
  return formatter.format(Number.isFinite(num) ? num : 0);
}

/**
 * Initialize all chips modes on page load
 */
export function initAllChipsModes() {
  logger.info('Initializing Chips Mode...');
  initChipsMode('job');
  initChipsMode('part');
  logger.info('✅ All Chips Modes initialized');
}
