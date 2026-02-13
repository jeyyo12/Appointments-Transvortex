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

  // Close dropdown on blur
  searchInput.addEventListener('blur', () => {
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
      }
    }
  });

  chipsList.addEventListener('click', (e) => {
    if (e.target.classList.contains('chipRemove')) {
      const chip = e.target.closest('.chipItem');
      removeChip(chip, kind);
      recalcAllTotals();
    }
  });

  logger.info(`✅ Chips mode initialized for ${kind}s`);
}

/**
 * Handle typeahead suggestions
 */
function handleTypeahead(query, kind, suggestBox, searchInput) {
  if (!query) {
    suggestBox.classList.remove('open');
    return;
  }

  const presets = PRESETS[kind === 'job' ? 'jobs' : 'parts'];
  const matches = presets.filter(item => 
    item.toLowerCase().includes(query) && 
    item.toLowerCase() !== query
  );

  let html = '';

  // Show matching presets
  matches.slice(0, 5).forEach(match => {
    html += `<div class="suggestItem" data-value="${escapeHtml(match)}">${highlightMatch(match, query)}</div>`;
  });

  // Add "Create new" option if query is custom
  if (!presets.includes(query)) {
    html += `<div class="suggestItem suggestAdd" data-value="${escapeHtml(query)}">➕ Add new: <strong>${escapeHtml(query)}</strong></div>`;
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
  
  // Create chip data
  const chip = {
    id,
    label: label.trim(),
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

  logger.info(`✅ Added ${kind}: "${label}"`);
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
