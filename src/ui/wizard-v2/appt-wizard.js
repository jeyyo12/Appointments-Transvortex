/**
 * Appointment Wizard V2 — Mobile Premium Step Flow
 * Feature flag: activated when `?ui=v2` is in the URL.
 *
 * Architecture:
 *  - Pure UI layer: zero Firestore / auth logic here
 *  - On submit: populates the existing #appointmentForm fields
 *    and dispatches a submit event so handleAddAppointment runs unchanged
 *  - Chips (jobs/parts) injected via populateChipsFromData() from chips-mode.js
 *  - Time: delegates to the existing window.TimePicker
 *
 * Steps:
 *  1. Client   — name, phone, contact preference
 *  2. Vehicle  — make/model, reg plate, mileage
 *  3. Jobs & Parts — simplified row input
 *  4. Date, Time & Location
 *  5. Confirm & Save
 */

const STEP_META = [
    { label: 'Client',    icon: '👤' },
    { label: 'Vehicle',   icon: '🚗' },
    { label: 'Jobs',      icon: '🛠️' },
    { label: 'DateTime',  icon: '📅' },
    { label: 'Confirm',   icon: '✅' },
];

// ── Wizard state ────────────────────────────────────
let wizState = createFreshState();

function createFreshState() {
    return {
        step: 0,
        // Step 1
        customerName: '',
        customerPhone: '',
        contactPref: '',
        // Step 2
        makeModel: '',
        regNumber: '',
        mileage: '',
        // Step 3
        jobs:  [],  // [{ description, qty, unitPrice }]
        parts: [],  // [{ description, qty, unitPrice }]
        // Step 4
        dateStr: '',
        time: '',
        serviceLocation: '',
        address: '',
        postcode: '',
        // computed
        notes: '',
    };
}

// ── DOM references ───────────────────────────────────
let overlay = null;
let panel   = null;
let bodyEl  = null;

let _timeObserver = null; // MutationObserver watching #appointmentTimeValue

// ── Public API ───────────────────────────────────────

export function initWizardV2() {
    buildDOM();
}

export function openWizard() {
    wizState = createFreshState();
    if (overlay) {
        renderStep(0);
        requestAnimationFrame(() => overlay.classList.add('is-open'));
    }
}

export function closeWizard() {
    if (overlay) overlay.classList.remove('is-open');
    stopTimeObserver();
}

// ── Build overlay DOM ────────────────────────────────

function buildDOM() {
    if (document.getElementById('wiz-overlay')) return; // already built

    // Load stylesheet
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = './src/ui/wizard-v2/appt-wizard.css';
    document.head.appendChild(link);

    overlay = document.createElement('div');
    overlay.id        = 'wiz-overlay';
    overlay.className = 'wiz-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Add Appointment');

    panel = document.createElement('div');
    panel.className = 'wiz-panel';
    panel.innerHTML = `
        <div class="wiz-handle" role="presentation"></div>
        <div class="wiz-header">
            <span class="wiz-title" id="wiz-title">New Appointment</span>
            <button class="wiz-close-btn" id="wiz-close" aria-label="Close wizard">&times;</button>
        </div>
        <div class="wiz-stepper" id="wiz-stepper" aria-hidden="true"></div>
        <div class="wiz-step-labels" id="wiz-step-labels" aria-hidden="true"></div>
        <div class="wiz-body" id="wiz-body"></div>
        <div class="wiz-footer" id="wiz-footer"></div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    bodyEl = panel.querySelector('#wiz-body');

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeWizard();
    });

    // Close button
    panel.querySelector('#wiz-close').addEventListener('click', closeWizard);

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeWizard();
    });
}

// ── Stepper ──────────────────────────────────────────

function updateStepper(stepIdx) {
    const stepperEl = panel.querySelector('#wiz-stepper');
    const labelsEl  = panel.querySelector('#wiz-step-labels');
    if (!stepperEl) return;

    stepperEl.innerHTML = '';
    labelsEl.innerHTML  = '';

    STEP_META.forEach((meta, i) => {
        // Dot
        const dot = document.createElement('div');
        dot.className = `wiz-step-dot${i < stepIdx ? ' done' : i === stepIdx ? ' active' : ''}`;
        dot.textContent = i < stepIdx ? '✓' : String(i + 1);
        stepperEl.appendChild(dot);

        // Connector line (between dots)
        if (i < STEP_META.length - 1) {
            const line = document.createElement('div');
            line.className = `wiz-step-line${i < stepIdx ? ' done' : ''}`;
            stepperEl.appendChild(line);
        }

        // Label
        const lbl = document.createElement('span');
        lbl.className = `wiz-step-label${i < stepIdx ? ' done' : i === stepIdx ? ' active' : ''}`;
        lbl.textContent = meta.label;
        labelsEl.appendChild(lbl);
    });
}

// ── Render step ──────────────────────────────────────

function renderStep(stepIdx) {
    wizState.step = stepIdx;
    updateStepper(stepIdx);

    const title = panel.querySelector('#wiz-title');
    const meta  = STEP_META[stepIdx];
    if (title) title.textContent = `${meta.icon} ${meta.label}`;

    switch (stepIdx) {
        case 0: renderStepClient();   break;
        case 1: renderStepVehicle();  break;
        case 2: renderStepJobs();     break;
        case 3: renderStepDateTime(); break;
        case 4: renderStepConfirm();  break;
    }
}

// ── Footer buttons ───────────────────────────────────

function setFooter(stepIdx) {
    const footer = panel.querySelector('#wiz-footer');
    const isFirst = stepIdx === 0;
    const isLast  = stepIdx === STEP_META.length - 1;

    footer.innerHTML = '';

    if (!isFirst) {
        const backBtn = document.createElement('button');
        backBtn.className   = 'wiz-btn-back';
        backBtn.textContent = '← Back';
        backBtn.type        = 'button';
        backBtn.addEventListener('click', () => goBack());
        footer.appendChild(backBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.id        = 'wiz-next-btn';
    nextBtn.className = `wiz-btn-next${isLast ? ' save-mode' : ''}`;
    nextBtn.type      = 'button';
    nextBtn.textContent = isLast ? '💾 Save Appointment' : 'Next →';
    nextBtn.addEventListener('click', () => goNext(stepIdx));
    footer.appendChild(nextBtn);
}

function goNext(stepIdx) {
    if (!collectAndValidateStep(stepIdx)) return;

    if (stepIdx < STEP_META.length - 1) {
        renderStep(stepIdx + 1);
        // Scroll body to top
        if (bodyEl) bodyEl.scrollTop = 0;
    } else {
        submitWizard();
    }
}

function goBack() {
    if (wizState.step > 0) {
        renderStep(wizState.step - 1);
        if (bodyEl) bodyEl.scrollTop = 0;
    }
}

// ── Step 1: Client ───────────────────────────────────

function renderStepClient() {
    bodyEl.innerHTML = `
        <div class="wiz-field">
            <label class="wiz-label" for="wiz-name">
                Name <span class="badge-optional">required</span>
            </label>
            <input
                id="wiz-name"
                class="wiz-input"
                type="text"
                placeholder="e.g., John Smith"
                autocomplete="name"
                value="${escHtml(wizState.customerName)}"
            />
        </div>
        <div class="wiz-field">
            <label class="wiz-label" for="wiz-phone">
                Phone <span class="badge-optional">required</span>
            </label>
            <input
                id="wiz-phone"
                class="wiz-input"
                type="tel"
                placeholder="+44 or 0..."
                autocomplete="tel"
                value="${escHtml(wizState.customerPhone)}"
            />
        </div>
        <div class="wiz-field">
            <label class="wiz-label" for="wiz-contact-pref">
                Contact Preference
            </label>
            <select id="wiz-contact-pref" class="wiz-select">
                <option value="">— Select —</option>
                <option value="phone" ${wizState.contactPref === 'phone' ? 'selected' : ''}>Phone</option>
                <option value="whatsapp" ${wizState.contactPref === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
                <option value="email" ${wizState.contactPref === 'email' ? 'selected' : ''}>Email</option>
            </select>
        </div>
        <div id="wiz-error" class="wiz-inline-error"></div>
    `;
    setFooter(0);
    bodyEl.querySelector('#wiz-name')?.focus();
}

// ── Step 2: Vehicle ──────────────────────────────────

function renderStepVehicle() {
    bodyEl.innerHTML = `
        <div class="wiz-row-2">
            <div class="wiz-field">
                <label class="wiz-label" for="wiz-make">Make/Model</label>
                <input id="wiz-make" class="wiz-input" type="text" placeholder="e.g., Dacia Logan"
                    autocomplete="off" value="${escHtml(wizState.makeModel)}" />
            </div>
            <div class="wiz-field">
                <label class="wiz-label" for="wiz-reg">
                    Reg Plate <span class="badge-optional">optional</span>
                </label>
                <input id="wiz-reg" class="wiz-input" type="text" placeholder="e.g., AB12 XYZ"
                    autocomplete="off" maxlength="10" style="text-transform:uppercase"
                    value="${escHtml(wizState.regNumber)}" />
            </div>
        </div>
        <div class="wiz-field">
            <label class="wiz-label" for="wiz-mileage">
                Mileage <span class="badge-optional">optional</span>
            </label>
            <input id="wiz-mileage" class="wiz-input" type="text"
                placeholder="e.g., 45,000" inputmode="numeric"
                value="${escHtml(wizState.mileage)}" />
        </div>
        <div id="wiz-error" class="wiz-inline-error"></div>
    `;
    setFooter(1);

    // Auto-uppercase reg
    const regInput = bodyEl.querySelector('#wiz-reg');
    if (regInput) {
        regInput.addEventListener('input', (e) => {
            const pos = e.target.selectionStart;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(pos, pos);
        });
    }
}

// ── Step 3: Jobs & Parts ─────────────────────────────

function renderStepJobs() {
    bodyEl.innerHTML = `
        <div class="wiz-section-title">Jobs / Labour</div>
        <div class="wiz-jobs-header">
            <span>Description</span><span>Qty</span><span>Price £</span><span></span>
        </div>
        <div class="wiz-jobs-list" id="wiz-jobs-list"></div>
        <button type="button" class="wiz-btn-add-job" id="wiz-add-job">+ Add Job</button>

        <div class="wiz-section-title" style="margin-top:14px;">Parts</div>
        <div class="wiz-jobs-header">
            <span>Description</span><span>Qty</span><span>Price £</span><span></span>
        </div>
        <div class="wiz-jobs-list" id="wiz-parts-list"></div>
        <button type="button" class="wiz-btn-add-job" id="wiz-add-part">+ Add Part</button>

        <div id="wiz-error" class="wiz-inline-error" style="margin-top:8px;"></div>
    `;
    setFooter(2);

    // Render existing
    const jobsList  = bodyEl.querySelector('#wiz-jobs-list');
    const partsList = bodyEl.querySelector('#wiz-parts-list');

    if (wizState.jobs.length === 0) wizState.jobs.push({ description: '', qty: 1, unitPrice: 0 });
    wizState.jobs.forEach((job, i)  => appendLineRow(jobsList,  job,  'job',  i));

    if (wizState.parts.length === 0) wizState.parts.push({ description: '', qty: 1, unitPrice: 0 });
    wizState.parts.forEach((part, i) => appendLineRow(partsList, part, 'part', i));

    bodyEl.querySelector('#wiz-add-job').addEventListener('click', () => {
        wizState.jobs.push({ description: '', qty: 1, unitPrice: 0 });
        appendLineRow(jobsList, wizState.jobs[wizState.jobs.length - 1], 'job', wizState.jobs.length - 1);
    });
    bodyEl.querySelector('#wiz-add-part').addEventListener('click', () => {
        wizState.parts.push({ description: '', qty: 1, unitPrice: 0 });
        appendLineRow(partsList, wizState.parts[wizState.parts.length - 1], 'part', wizState.parts.length - 1);
    });
}

function appendLineRow(container, item, kind, idx) {
    const row = document.createElement('div');
    row.className = 'wiz-job-row';
    row.dataset.idx  = idx;
    row.dataset.kind = kind;
    row.innerHTML = `
        <input class="wiz-input row-desc" type="text" placeholder="Description" value="${escHtml(item.description)}">
        <input class="wiz-input row-qty"  type="number" min="1" value="${item.qty}" style="text-align:center">
        <input class="wiz-input row-price" type="number" min="0" step="0.01" placeholder="0.00" value="${item.unitPrice || ''}">
        <button type="button" class="wiz-btn-remove-job" aria-label="Remove">×</button>
    `;

    row.querySelector('.wiz-btn-remove-job').addEventListener('click', () => {
        const arr  = kind === 'job' ? wizState.jobs : wizState.parts;
        const idxN = parseInt(row.dataset.idx, 10);
        arr.splice(idxN, 1);
        row.remove();
        // Reindex remaining rows
        container.querySelectorAll('.wiz-job-row').forEach((r, i) => { r.dataset.idx = i; });
    });

    container.appendChild(row);
}

function collectJobRows(container, kind) {
    const arr = [];
    container.querySelectorAll('.wiz-job-row').forEach(row => {
        const desc  = row.querySelector('.row-desc')?.value.trim()  || '';
        const qty   = parseInt(row.querySelector('.row-qty')?.value, 10) || 1;
        const price = parseFloat(row.querySelector('.row-price')?.value) || 0;
        if (desc) arr.push({ description: desc, name: desc, qty, unitPrice: price });
    });
    return arr;
}

// ── Step 4: Date, Time, Location ─────────────────────

function renderStepDateTime() {
    const stored = wizState.time || document.getElementById('appointmentTimeValue')?.value || '';

    bodyEl.innerHTML = `
        <div class="wiz-row-2">
            <div class="wiz-field">
                <label class="wiz-label" for="wiz-date">Date</label>
                <input id="wiz-date" class="wiz-input" type="date"
                    value="${escHtml(wizState.dateStr)}" />
            </div>
            <div class="wiz-field">
                <label class="wiz-label">Time</label>
                <div class="wiz-time-field">
                    <div id="wiz-time-display" class="wiz-input wiz-time-display"
                        role="button" tabindex="0"
                        style="background:#fff; cursor:pointer; user-select:none;"
                        title="Tap to pick time"
                    >${stored ? stored : 'Tap to select'}</div>
                </div>
            </div>
        </div>

        <div class="wiz-field">
            <label class="wiz-label" for="wiz-location">Service Location</label>
            <select id="wiz-location" class="wiz-select">
                <option value="">— Select —</option>
                <option value="garage" ${wizState.serviceLocation === 'garage' ? 'selected' : ''}>At Garage</option>
                <option value="client" ${wizState.serviceLocation === 'client' ? 'selected' : ''}>At Client</option>
            </select>
        </div>

        <div class="wiz-address-block${wizState.serviceLocation === 'client' ? ' visible' : ''}" id="wiz-addr-block">
            <div class="wiz-field">
                <label class="wiz-label" for="wiz-address">Address</label>
                <input id="wiz-address" class="wiz-input" type="text"
                    placeholder="Street address" value="${escHtml(wizState.address)}" />
            </div>
            <div class="wiz-field">
                <label class="wiz-label" for="wiz-postcode">Postcode <span class="badge-optional">optional</span></label>
                <input id="wiz-postcode" class="wiz-input" type="text"
                    placeholder="e.g., B8 2JT" value="${escHtml(wizState.postcode)}" />
            </div>
        </div>

        <div id="wiz-error" class="wiz-inline-error"></div>
    `;
    setFooter(3);

    // Show/hide address block
    const locationSel = bodyEl.querySelector('#wiz-location');
    const addrBlock   = bodyEl.querySelector('#wiz-addr-block');
    locationSel.addEventListener('change', () => {
        addrBlock.classList.toggle('visible', locationSel.value === 'client');
    });

    // Time display — open TimePicker
    const timeDisplay = bodyEl.querySelector('#wiz-time-display');
    const openTimePicker = () => {
        if (window.TimePicker && typeof window.TimePicker.open === 'function') {
            window.TimePicker.open();
            startTimeObserver(timeDisplay);
        }
    };
    timeDisplay.addEventListener('click', openTimePicker);
    timeDisplay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTimePicker(); }
    });
}

// Watch #appointmentTimeValue so wizard display updates when TimePicker confirms
function startTimeObserver(displayEl) {
    stopTimeObserver();
    const hiddenInput = document.getElementById('appointmentTimeValue');
    if (!hiddenInput || !displayEl) return;

    _timeObserver = new MutationObserver(() => {
        const val = hiddenInput.value;
        if (val) {
            displayEl.textContent = val;
            wizState.time = val;
        }
    });
    _timeObserver.observe(hiddenInput, { attributes: true, attributeFilter: ['value'] });

    // Also poll on overlay-close (transitionend of timePicker)
    const tp = document.getElementById('timePicker');
    if (tp) {
        const onTpClose = () => {
            const val = hiddenInput.value;
            if (val) {
                displayEl.textContent = val;
                wizState.time = val;
            }
        };
        tp.addEventListener('transitionend', onTpClose, { once: false });
        // Store cleanup ref
        _timeObserver._cleanupTp = () => tp.removeEventListener('transitionend', onTpClose);
    }
}

function stopTimeObserver() {
    if (_timeObserver) {
        _timeObserver.disconnect();
        if (typeof _timeObserver._cleanupTp === 'function') _timeObserver._cleanupTp();
        _timeObserver = null;
    }
}

// ── Step 5: Confirm ──────────────────────────────────

function renderStepConfirm() {
    const total = [
        ...wizState.jobs,
        ...wizState.parts
    ].reduce((s, item) => s + (item.qty || 1) * (item.unitPrice || 0), 0);

    const jobLines  = wizState.jobs.filter(j => j.description);
    const partLines = wizState.parts.filter(p => p.description);

    const listEntries = [
        ...jobLines.map(j  => `<div class="wiz-summary-row"><span class="key">${escHtml(j.description)}</span><span>£${((j.qty||1) * (j.unitPrice||0)).toFixed(2)}</span></div>`),
        ...partLines.map(p => `<div class="wiz-summary-row"><span class="key">${escHtml(p.description)}</span><span>£${((p.qty||1) * (p.unitPrice||0)).toFixed(2)}</span></div>`)
    ].join('') || '<div class="wiz-summary-row" style="color:#94A3B8">No jobs or parts added</div>';

    bodyEl.innerHTML = `
        <div class="wiz-summary">
            <div class="wiz-summary-row"><span class="key">👤 Client</span><span>${escHtml(wizState.customerName || '—')}</span></div>
            <div class="wiz-summary-row"><span class="key">📞 Phone</span><span>${escHtml(wizState.customerPhone || '—')}</span></div>
            <div class="wiz-summary-row"><span class="key">🚗 Vehicle</span><span>${escHtml(wizState.makeModel || '—')}${wizState.regNumber ? ' · ' + escHtml(wizState.regNumber) : ''}</span></div>
            <div class="wiz-summary-row"><span class="key">📅 Date</span><span>${wizState.dateStr || '—'}</span></div>
            <div class="wiz-summary-row"><span class="key">🕐 Time</span><span>${wizState.time || document.getElementById('appointmentTimeValue')?.value || '—'}</span></div>
            <div class="wiz-summary-row"><span class="key">📍 Location</span><span>${wizState.serviceLocation || '—'}</span></div>
        </div>
        <div class="wiz-section-title" style="margin-top:14px;">Jobs &amp; Parts</div>
        <div class="wiz-summary" style="margin-top:0;">
            ${listEntries}
            <div class="wiz-summary-row wiz-summary-total">
                <span class="key">💰 Estimated Total</span>
                <span>£${total.toFixed(2)}</span>
            </div>
        </div>
        <div id="wiz-error" class="wiz-inline-error" style="margin-top:8px;"></div>
    `;
    setFooter(4);
}

// ── Collect + validate steps ─────────────────────────

function collectAndValidateStep(stepIdx) {
    const errEl = bodyEl.querySelector('#wiz-error');
    const setErr = (msg) => { if (errEl) errEl.textContent = msg; };
    const clearErr = () => { if (errEl) errEl.textContent = ''; };

    switch (stepIdx) {
        case 0: {
            const name  = bodyEl.querySelector('#wiz-name')?.value.trim()  || '';
            const phone = bodyEl.querySelector('#wiz-phone')?.value.trim() || '';
            const pref  = bodyEl.querySelector('#wiz-contact-pref')?.value || '';
            if (!name) { setErr('⚠️ Name is required'); bodyEl.querySelector('#wiz-name')?.classList.add('required-empty'); return false; }
            clearErr();
            wizState.customerName  = name;
            wizState.customerPhone = phone;
            wizState.contactPref   = pref;
            return true;
        }
        case 1: {
            clearErr();
            wizState.makeModel  = bodyEl.querySelector('#wiz-make')?.value.trim()    || '';
            wizState.regNumber  = bodyEl.querySelector('#wiz-reg')?.value.trim()     || '';
            wizState.mileage    = bodyEl.querySelector('#wiz-mileage')?.value.trim() || '';
            return true;
        }
        case 2: {
            clearErr();
            // Collect rows
            const jobsContainer  = bodyEl.querySelector('#wiz-jobs-list');
            const partsContainer = bodyEl.querySelector('#wiz-parts-list');
            wizState.jobs  = jobsContainer  ? collectJobRows(jobsContainer,  'job')  : [];
            wizState.parts = partsContainer ? collectJobRows(partsContainer, 'part') : [];
            return true;
        }
        case 3: {
            const location = bodyEl.querySelector('#wiz-location')?.value || '';
            const dateVal  = bodyEl.querySelector('#wiz-date')?.value     || '';
            if (!dateVal)     { setErr('⚠️ Date is required'); return false; }
            if (!location)    { setErr('⚠️ Service location is required'); return false; }
            clearErr();
            wizState.dateStr        = dateVal;
            wizState.time           = document.getElementById('appointmentTimeValue')?.value || wizState.time || '';
            wizState.serviceLocation = location;
            wizState.address        = bodyEl.querySelector('#wiz-address')?.value.trim()  || '';
            wizState.postcode       = bodyEl.querySelector('#wiz-postcode')?.value.trim() || '';
            return true;
        }
        case 4:
            return true; // Confirm step — no extra validation, submitWizard does the work
        default:
            return true;
    }
}

// ── Submit wizard ────────────────────────────────────

async function submitWizard() {
    const btn = panel.querySelector('#wiz-next-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

    try {
        // 1. Populate chips (jobs + parts) into existing #jobsChips / #partsChips
        const { populateChipsFromData } = await import('../../core/chips-mode.js');
        populateChipsFromData(wizState.jobs, wizState.parts);

        // 2. Populate simple scalar fields in the existing form
        setField('customerName',      wizState.customerName);
        setField('customerPhone',     wizState.customerPhone);
        setField('contactPref',       wizState.contactPref,  'select');
        setField('makeModel',         wizState.makeModel);
        setField('regNumber',         wizState.regNumber.toUpperCase());
        setField('mileage',           wizState.mileage);
        setField('appointmentDate',   wizState.dateStr);
        // Time: already written to #appointmentTimeValue by TimePicker; write display too
        const timeVal = wizState.time || document.getElementById('appointmentTimeValue')?.value || '';
        const hiddenTime   = document.getElementById('appointmentTimeValue');
        const displayTime  = document.getElementById('appointmentTime');
        if (hiddenTime)  hiddenTime.value  = timeVal;
        if (displayTime) displayTime.value = timeVal;

        setField('serviceLocation', wizState.serviceLocation, 'select');

        // Location-specific fields
        if (wizState.serviceLocation === 'client') {
            setField('address',  wizState.address);
            setField('postcode', wizState.postcode);
            const clientSection = document.getElementById('clientAddressSection');
            const garageSection = document.getElementById('garageAddressSection');
            if (clientSection) clientSection.style.display = 'block';
            if (garageSection) garageSection.style.display = 'none';
        } else if (wizState.serviceLocation === 'garage') {
            const garageSection = document.getElementById('garageAddressSection');
            const clientSection = document.getElementById('clientAddressSection');
            if (garageSection) garageSection.style.display = 'block';
            if (clientSection) clientSection.style.display = 'none';
        }

        // 3. Dispatch submit on the existing form → handleAddAppointment runs
        const form = document.getElementById('appointmentForm');
        if (!form) throw new Error('appointmentForm not found');
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);

        // 4. Close wizard — handleAddAppointment will show its own notifications
        closeWizard();

    } catch (err) {
        console.error('[WizardV2] Submit failed:', err);
        const errEl = bodyEl.querySelector('#wiz-error');
        if (errEl) errEl.textContent = `⚠️ ${err.message}`;
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save Appointment'; }
    }
}

function setField(id, value, type = 'input') {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value || '';
    // Trigger change event for any listeners
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (type === 'input') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

// ── Utility ──────────────────────────────────────────

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
