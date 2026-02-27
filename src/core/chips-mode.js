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
  parts: [],
  activePresetGroup: {
    job: 'favorites',
    part: 'favorites'
  }
};

const PRESET_CACHE_KEY = 'tvx_presets_cache_v1';
const FAV_KEY = kind => `tvx_favorites_${kind}`;
const RECENT_KEY = kind => `tvx_recent_${kind}`;

let presetCollections = {
  jobs: [],
  parts: []
};

function readLocalArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalArray(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    logger.debug('LocalStorage write skipped');
  }
}

function keyForKind(kind) {
  return kind === 'job' ? 'jobs' : 'parts';
}

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

async function ensurePresetCollectionsLoaded() {
  if (presetCollections.jobs.length || presetCollections.parts.length) return;

  const cached = readLocalArray(PRESET_CACHE_KEY);
  if (cached && cached.jobs && cached.parts) {
    presetCollections = {
      jobs: Array.isArray(cached.jobs) ? cached.jobs : [],
      parts: Array.isArray(cached.parts) ? cached.parts : []
    };
  }

  if (!firestoreDb) return;

  try {
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const [jobsSnapshot, partsSnapshot] = await Promise.all([
      getDocs(collection(firestoreDb, 'presets_jobs')),
      getDocs(collection(firestoreDb, 'presets_parts'))
    ]);

    const jobs = jobsSnapshot.docs.map(doc => String(doc.data()?.name || '').trim()).filter(Boolean);
    const parts = partsSnapshot.docs.map(doc => String(doc.data()?.name || '').trim()).filter(Boolean);

    presetCollections = {
      jobs: [...new Set([...PRESETS.jobs, ...jobs])],
      parts: [...new Set([...PRESETS.parts, ...parts])]
    };

    writeLocalArray(PRESET_CACHE_KEY, presetCollections);
  } catch (err) {
    logger.warn('Preset collections load failed, using local defaults', err);
  }
}

function markRecent(kind, label) {
  const key = RECENT_KEY(kind);
  const current = readLocalArray(key).filter(item => item.toLowerCase() !== label.toLowerCase());
  current.unshift(label);
  writeLocalArray(key, current.slice(0, 12));
}

function getQuickItems(kind, group) {
  const listKey = keyForKind(kind);
  const all = presetCollections[listKey].length ? presetCollections[listKey] : PRESETS[listKey];
  if (group === 'favorites') return readLocalArray(FAV_KEY(kind));
  if (group === 'recent') return readLocalArray(RECENT_KEY(kind));
  return all.slice(0, 10);
}

function renderQuickPresetChips(kind) {
  const quickListId = kind === 'job' ? 'jobPresetQuickList' : 'partPresetQuickList';
  const quickList = document.getElementById(quickListId);
  if (!quickList) return;

  const group = chipsState.activePresetGroup[kind] || 'favorites';
  const items = getQuickItems(kind, group);

  quickList.innerHTML = items.map(label => (
    `<button type="button" class="presetQuickChip" data-action="add-preset-chip" data-kind="${kind}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`
  )).join('');
}

function bindPresetGroupUi(kind, searchInput, chipsList, countBadge) {
  const groupsId = kind === 'job' ? 'jobPresetGroups' : 'partPresetGroups';
  const groupsRoot = document.getElementById(groupsId);
  const quickListId = kind === 'job' ? 'jobPresetQuickList' : 'partPresetQuickList';
  const quickList = document.getElementById(quickListId);
  if (!groupsRoot || !quickList) return;

  groupsRoot.addEventListener('click', (event) => {
    const btn = event.target.closest('.presetGroupChip');
    if (!btn) return;

    chipsState.activePresetGroup[kind] = btn.dataset.presetGroup || 'favorites';
    groupsRoot.querySelectorAll('.presetGroupChip').forEach(node => node.classList.remove('active'));
    btn.classList.add('active');
    renderQuickPresetChips(kind);
  });

  quickList.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action="add-preset-chip"]');
    if (!btn) return;
    const label = String(btn.dataset.label || '').trim();
    if (!label) return;
    addChip(label, kind, searchInput, chipsList, countBadge);
  });
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
  const tabCount = document.getElementById(isJob ? 'jobsTabCount' : 'partsTabCount');

  if (!searchInput || !suggestBox || !chipsList) {
    logger.warn(`Chips mode elements not found for ${kind}`);
    return;
  }

  ensurePresetCollectionsLoaded().finally(() => {
    bindPresetGroupUi(kind, searchInput, chipsList, countBadge);
    renderQuickPresetChips(kind);
  });

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

  // Add button click (optional — button may be absent; Enter key is the primary add path)
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) {
        addChip(query, kind, searchInput, chipsList, countBadge);
      }
    });
  }

  // Enter key to add
  searchInput.addEventListener('keydown', (e) => {
    const items = Array.from(suggestBox.querySelectorAll('.suggestItem'));

    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      const currentIdx = items.findIndex(item => item.classList.contains('highlight'));
      const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      items.forEach(item => item.classList.remove('highlight'));
      items[nextIdx].classList.add('highlight');
      return;
    }

    if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      const currentIdx = items.findIndex(item => item.classList.contains('highlight'));
      const nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      items.forEach(item => item.classList.remove('highlight'));
      items[nextIdx].classList.add('highlight');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const activeItem = suggestBox.querySelector('.suggestItem.highlight') || items[0];
      if (activeItem?.dataset?.value) {
        addChip(activeItem.dataset.value, kind, searchInput, chipsList, countBadge);
      } else {
        const query = searchInput.value.trim();
        if (query) {
          addChip(query, kind, searchInput, chipsList, countBadge);
        }
      }
    }
  });

  // Event delegation for chip controls (live updates)
  chipsList.addEventListener('input', (e) => {
    if (
      e.target.classList.contains('chipQty') ||
      e.target.classList.contains('chipPrice') ||
      e.target.classList.contains('chipVat') ||
      e.target.classList.contains('chipDescInput')
    ) {
      const chipEl = e.target.closest('.chipItem');
      if (chipEl) {
        recalcChipRow(chipEl, kind);
        recalcAllTotals();
        triggerAutoSave(); // Auto-save when qty/price changes
      }
    }
  });

  chipsList.addEventListener('click', (e) => {
    const chip = e.target.closest('.chipItem');
    if (!chip) return;

    if (e.target.closest('.chipRemove')) {
      removeChip(chip, kind, countBadge, tabCount);

  syncEnterpriseItemsPanelState();
      recalcAllTotals();
      triggerAutoSave();
      return;
    }

    const stepBtn = e.target.closest('.chipStepperBtn');
    if (stepBtn) {
      const qtyInput = chip.querySelector('.chipQty');
      if (!qtyInput) return;
      const currentQty = Math.max(1, parseInt(qtyInput.value || '1', 10) || 1);
      const delta = stepBtn.classList.contains('chipStepperBtn--plus') ? 1 : -1;
      qtyInput.value = String(Math.max(1, currentQty + delta));
      recalcChipRow(chip, kind);
      recalcAllTotals();
      triggerAutoSave();
      return;
    }

    const favBtn = e.target.closest('.chipFav');
    if (favBtn) {
      const label = chip.querySelector('.chipName')?.textContent?.trim();
      if (!label) return;
      const key = FAV_KEY(kind);
      const items = readLocalArray(key);
      const exists = items.some(entry => entry.toLowerCase() === label.toLowerCase());
      const next = exists
        ? items.filter(entry => entry.toLowerCase() !== label.toLowerCase())
        : [label, ...items].slice(0, 20);
      writeLocalArray(key, next);
      favBtn.classList.toggle('active', !exists);
      if ((chipsState.activePresetGroup[kind] || 'favorites') === 'favorites') {
        renderQuickPresetChips(kind);
      }
      return;
    }
  });

  if (tabCount && countBadge) {
    tabCount.textContent = countBadge.textContent || '0';
  }

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
  
  await ensurePresetCollectionsLoaded();

  // Get preset matches (Firestore collections + defaults)
  const presets = presetCollections[keyForKind(kind)].length
    ? presetCollections[keyForKind(kind)]
    : PRESETS[keyForKind(kind)];
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

  const suggestItems = Array.from(suggestBox.querySelectorAll('.suggestItem'));
  if (suggestItems.length > 0) {
    suggestItems.forEach(item => item.classList.remove('highlight'));
    suggestItems[0].classList.add('highlight');
  }

  // Attach click handlers to suggestions
  suggestBox.querySelectorAll('.suggestItem').forEach(item => {
    item.addEventListener('click', () => {
      searchInput.value = item.dataset.value;
      suggestBox.classList.remove('open');
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  });
}

/**
 * Add a chip to the list
 */
function addChip(label, kind, searchInput, chipsList, countBadge) {
  const isJob = kind === 'job';
  const tabCount = document.getElementById(isJob ? 'jobsTabCount' : 'partsTabCount');
  const id = `${kind}-${Date.now()}`;
  
  // Format label to Title Case
  const formattedLabel = toTitleCaseSmart(label.trim());
  
  // Create chip data
  const chip = {
    id,
    label: formattedLabel,
    qty: 1,
    price: 0,
    vatRate: 0,
    kind
  };

  // Add to state
  chipsState[isJob ? 'jobs' : 'parts'].push(chip);

  // Render chip
  renderChip(chip, chipsList, kind);

  // Auto-scroll only when the new row is outside the visible list area
  const newRow = chipsList.lastElementChild;
  if (newRow) {
    setTimeout(() => scrollRowIntoListView(chipsList, newRow), 50);
  }

  // Update count
  const count = chipsState[isJob ? 'jobs' : 'parts'].length;
  countBadge.textContent = count;
  if (tabCount) tabCount.textContent = String(count);

  // Clear input
  searchInput.value = '';
  searchInput.focus();

  // Update totals
  recalcAllTotals();
  
  // Trigger auto-save
  triggerAutoSave();

  // Track recents for quick chips
  markRecent(kind, formattedLabel);
  if ((chipsState.activePresetGroup[kind] || 'favorites') === 'recent') {
    renderQuickPresetChips(kind);
  }

  // Persist to catalog (async, don't wait)
  persistToCatalog(formattedLabel, kind);

  logger.info(`✅ Added ${kind}: "${formattedLabel}"`);
}

function scrollRowIntoListView(listEl, rowEl) {
  if (!listEl || !rowEl) return;

  const listRect = listEl.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  const rowOutOfView = rowRect.bottom > listRect.bottom || rowRect.top < listRect.top;

  if (rowOutOfView) {
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function syncEnterpriseItemsPanelState() {
  const panel = document.querySelector('.itemsPanel.itemsPanel--enterprise');
  if (!panel) return;

  const hasItems = (chipsState.jobs.length + chipsState.parts.length) > 0;
  panel.classList.toggle('is-empty', !hasItems);
}

/**
 * Render a single chip
 */
function renderChip(chip, chipsList, kind) {
  const favorites = readLocalArray(FAV_KEY(kind));
  const isFavorite = favorites.some(item => item.toLowerCase() === chip.label.toLowerCase());

  const chipEl = document.createElement('div');
  chipEl.className = 'chipItem';
  chipEl.dataset.kind = kind;
  chipEl.dataset.id = chip.id;

  chipEl.innerHTML = `
    <div class="chipTop">
      <b class="chipName">${escapeHtml(chip.label)}</b>
      <div class="chipActions">
        <button class="chipFav ${isFavorite ? 'active' : ''}" type="button" title="Toggle favorite" aria-label="Toggle favorite">★</button>
        <button class="chipRemove" type="button" title="Remove">✕</button>
      </div>
    </div>

    <div class="chipBottom">
      <input class="chipDescInput" type="text" value="${escapeHtml(chip.label)}" title="${escapeHtml(chip.label)}" aria-label="Description" />
      <div class="chipStepper" role="group" aria-label="Quantity controls">
        <button type="button" class="chipStepperBtn chipStepperBtn--minus" aria-label="Decrease quantity">−</button>
        <input class="chipQty" type="number" min="1" value="${chip.qty}" />
        <button type="button" class="chipStepperBtn chipStepperBtn--plus" aria-label="Increase quantity">+</button>
      </div>

      <input class="chipPrice" type="number" min="0" step="0.01" placeholder="£0.00" value="${chip.price || ''}" aria-label="Unit price" />

      <select class="chipVat" aria-label="VAT rate">
        <option value="0" ${Number(chip.vatRate || 0) === 0 ? 'selected' : ''}>0%</option>
        <option value="20" ${Number(chip.vatRate || 0) === 20 ? 'selected' : ''}>20%</option>
      </select>

      <div class="chipTotal">${formatCurrencyGBP(chip.qty * chip.price)}</div>

      <div class="chipActions chipActions--row">
        <button class="chipRemove" type="button" title="Remove">✕</button>
      </div>
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
  const vatInput = chipEl.querySelector('.chipVat');
  const descInput = chipEl.querySelector('.chipDescInput');
  const totalDisplay = chipEl.querySelector('.chipTotal');

  if (!qtyInput || !priceInput || !totalDisplay) return;

  const rawQty = qtyInput.value.trim();
  let qty = rawQty === '' ? 0 : parseInt(rawQty, 10);
  if (!Number.isFinite(qty)) qty = 0;
  if (rawQty !== '' && qty < 1) qty = 1;

  const rawPrice = priceInput.value.trim();
  let price = rawPrice === '' ? 0 : parseFloat(rawPrice);
  if (!Number.isFinite(price) || price < 0) price = 0;

  const vatRate = Math.max(0, parseFloat(vatInput?.value || '0') || 0);
  const description = String(descInput?.value || '').trim();

  const base = qty * price;
  const vatAmount = base * (vatRate / 100);
  const total = base + vatAmount;
  totalDisplay.textContent = formatCurrencyGBP(total);

  const titleName = chipEl.querySelector('.chipName');
  if (titleName) titleName.textContent = description || 'Unnamed item';
  if (descInput) descInput.title = description || 'Unnamed item';

  // Update state
  const id = chipEl.dataset.id;
  const isJob = kind === 'job';
  const items = chipsState[isJob ? 'jobs' : 'parts'];
  const item = items.find(i => i.id === id);
  if (item) {
    item.label = description;
    item.qty = qty;
    item.price = price;
    item.vatRate = vatRate;
  }
}

/**
 * Remove a chip
 */
function removeChip(chipEl, kind, countBadge, tabCount) {
  const id = chipEl.dataset.id;
  const isJob = kind === 'job';
  const items = chipsState[isJob ? 'jobs' : 'parts'];
  const index = items.findIndex(i => i.id === id);
  
  if (index > -1) {
    items.splice(index, 1);
  }

  chipEl.remove();

  // Update count
  if (countBadge) countBadge.textContent = String(items.length);
  if (tabCount) tabCount.textContent = String(items.length);

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
  const vatJobs = chipsState.jobs.reduce((sum, job) => sum + ((job.qty * job.price) * ((job.vatRate || 0) / 100)), 0);
  const vatParts = chipsState.parts.reduce((sum, part) => sum + ((part.qty * part.price) * ((part.vatRate || 0) / 100)), 0);
  const vat = vatJobs + vatParts;
  const total = combined + vat;

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
  const vatTargets = [
    document.getElementById('vatAmount')
  ].filter(Boolean);
  const totalTargets = [
    document.getElementById('totalAmount'),
    document.getElementById('workOrderHeadTotal')
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
  vatTargets.forEach(el => {
    el.textContent = formatCurrencyGBP(vat);
  });
  totalTargets.forEach(el => {
    el.textContent = formatCurrencyGBP(total);
  });

  const jobsTabCount = document.getElementById('jobsTabCount');
  const partsTabCount = document.getElementById('partsTabCount');
  if (jobsTabCount) jobsTabCount.textContent = String(chipsState.jobs.length);
  if (partsTabCount) partsTabCount.textContent = String(chipsState.parts.length);

  syncEnterpriseItemsPanelState();

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
  const jobsTabCount = document.getElementById('jobsTabCount');
  const partsTabCount = document.getElementById('partsTabCount');
  
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
      vatRate: parseFloat(job.vatRate ?? 0) || 0,
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
      vatRate: parseFloat(part.vatRate ?? 0) || 0,
      kind: 'part'
    };
    
    chipsState.parts.push(chip);
    if (partsChipsList) renderChip(chip, partsChipsList, 'part');
  });
  
  // Update count badges
  if (jobsCountBadge) jobsCountBadge.textContent = chipsState.jobs.length;
  if (partsCountBadge) partsCountBadge.textContent = chipsState.parts.length;
  if (jobsTabCount) jobsTabCount.textContent = String(chipsState.jobs.length);
  if (partsTabCount) partsTabCount.textContent = String(chipsState.parts.length);
  
  // Update totals
  recalcAllTotals();

  // Refresh quick chips cache visuals
  renderQuickPresetChips('job');
  renderQuickPresetChips('part');
  
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
