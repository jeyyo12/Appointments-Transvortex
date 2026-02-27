/**
 * TRANSVORTEX FORM STEPPER
 * Converts the Add Appointment form into a 3-step mobile wizard.
 *
 * Strategy:
 *  - Mobile only (≤ 767px). On ≥ 768px all sections are shown, stepper hidden.
 *  - Wraps existing form sections — does NOT change IDs, names, or Firestore logic.
 *  - Save button proxies the original #submitAppointmentBtn click.
 *  - Respects edit-mode (resets to step 1 when editing starts).
 *  - Handles the "EU Company (RO)" tab switching gracefully.
 *
 * Steps:
 *  1 — Client & Date/Time       (appt-card[0] + appt-card[1])
 *  2 — Vehicle & Location       (appt-card[2] + appt-card[3])
 *  3 — Jobs/Parts & Notes       (.itemsPanel + .premium-notes-card)
 */

(function tvFormStepper() {
  'use strict';

  const MOBILE_BREAKPOINT = 768;
  const STEPPER_ID = 'tvStepperHeader';
  const FOOTER_ID  = 'tvStepperFooter';

  const STEP_DEFS = [
    { label: 'Client & Time'    },
    { label: 'Vehicle & Location' },
    { label: 'Jobs & Notes'     },
  ];

  let currentStep = 0;
  let stepSections  = [];  // Array<Array<HTMLElement>>
  let stepperHeader = null;
  let stepperFooter = null;
  let originalActions = null;
  let isMobile = false;

  /* ─────────────────── DOM Query helpers ─────────────────── */

  function $id(id)  { return document.getElementById(id); }

  /* ─────────────────── Initialise ────────────────────────── */

  function init() {
    const form  = $id('appointmentForm');
    const panel = $id('apptTabAppointment');
    if (!form || !panel) return;

    const grid = panel.querySelector('.appt-form__grid');
    if (!grid) return;

    const cards        = Array.from(grid.querySelectorAll(':scope > .appt-card'));
    const itemsPanel   = grid.querySelector(':scope > .itemsPanel');
    const notesSection = grid.querySelector(':scope > .premium-notes-card');

    // Need at least 4 appt-cards to form 3 steps
    if (cards.length < 4) return;

    stepSections = [
      [cards[0], cards[1]].filter(Boolean),           // Step 1
      [cards[2], cards[3]].filter(Boolean),           // Step 2
      [itemsPanel, notesSection].filter(Boolean),     // Step 3
    ];

    // Tag each element
    stepSections.forEach((group, idx) => {
      group.forEach(el => {
        el.dataset.tvStep = String(idx);
        el.classList.add('tv-step-section');
      });
    });

    // Build stepper header
    stepperHeader = buildStepperHeader(panel, grid);

    // Build stepper footer
    originalActions = form.querySelector('.appt-form__actions');
    stepperFooter   = buildStepperFooter(form, originalActions);

    // Wire navigation
    $id('tvStepNext')?.addEventListener('click', () => goToStep(currentStep + 1));
    $id('tvStepPrev')?.addEventListener('click', () => goToStep(currentStep - 1));
    $id('tvStepSave')?.addEventListener('click', () => {
      const btn = $id('submitAppointmentBtn');
      if (btn) btn.click();
    });

    // Track save status
    const _updateSaveStatus = (text, cls) => {
      const el = $id('tvStepSaveStatus');
      if (!el) return;
      el.textContent = text;
      el.className = 'tv-step-save-status' + (cls ? ' ' + cls : '');
    };

    // Mark as saved when form resets (successful submit)
    form.addEventListener('tvFormReset', () => {
      _updateSaveStatus('Saved ✓', 'tv-step-save-status--saved');
      goToStep(0);
      setTimeout(() => _updateSaveStatus('Not saved', ''), 4000);
    });

    // Mark dirty when any input changes
    form.addEventListener('input', () => {
      const el = $id('tvStepSaveStatus');
      if (el && el.textContent === 'Saved ✓') _updateSaveStatus('Not saved', '');
    }, { passive: true });

    // Watch edit-mode banner — restart stepper at step 1 when editing begins
    const editBanner = $id('editModeBanner');
    if (editBanner) {
      new MutationObserver(() => {
        if (editBanner.style.display !== 'none' && editBanner.style.display !== '') {
          goToStep(0);
        }
      }).observe(editBanner, { attributes: true, attributeFilter: ['style'] });
    }

    // Watch the EU Company tab — disable stepper while on that tab
    const tabBtns = document.querySelectorAll('#apptFormTabs .appt-form-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const isRoTab = btn.dataset.apptTab === 'invoice-ro';
        if (stepperHeader) stepperHeader.style.display = isRoTab ? 'none' : '';
        if (stepperFooter) stepperFooter.style.display = isRoTab ? 'none' : '';
        if (originalActions) originalActions.style.display = isRoTab ? '' : 'none';
      });
    });

    // Respond to window resize
    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();
  }

  /* ─────────────────── DOM construction ──────────────────── */

  function buildStepperHeader(panel, grid) {
    const header = document.createElement('div');
    header.id        = STEPPER_ID;
    header.className = 'tv-stepper-header';
    header.setAttribute('aria-hidden', 'true');

    const progress = STEP_DEFS.map((step, i) => {
      const dot = `<div class="tv-stepper-dot" id="tvStepDot${i}">
        <span class="tv-dot-num">${i + 1}</span>
        <i class="fas fa-check tv-dot-check" aria-hidden="true" style="display:none"></i>
      </div>`;
      const connector = i < STEP_DEFS.length - 1
        ? `<div class="tv-step-connector" id="tvStepConn${i}"></div>` : '';
      return dot + connector;
    }).join('');

    header.innerHTML = `
      <div class="tv-stepper-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${STEP_DEFS.length}" aria-valuenow="1">
        ${progress}
      </div>
      <div class="tv-stepper-label" id="tvStepLabel" aria-live="polite"></div>
    `;

    // Insert before the grid
    panel.insertBefore(header, grid);
    return header;
  }

  function buildStepperFooter(form, originalActions) {
    const footer = document.createElement('div');
    footer.id        = FOOTER_ID;
    footer.className = 'tv-stepper-footer action-bar';

    footer.innerHTML = `
      <button type="button" class="tv-step-btn tv-step-btn--prev" id="tvStepPrev" aria-label="Previous step" disabled>
        <i class="fas fa-chevron-left" aria-hidden="true"></i> Back
      </button>
      <output id="tvStepSaveStatus" class="tv-step-save-status">Not saved</output>
      <button type="button" class="tv-step-btn tv-step-btn--next" id="tvStepNext" aria-label="Next step">
        Next <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
      <button type="button" class="tv-step-btn tv-step-btn--save" id="tvStepSave" aria-label="Save appointment" style="display:none;">
        <i class="fas fa-check" aria-hidden="true"></i> Save
      </button>
    `;

    // Insert immediately before the original actions bar (or at end of form)
    if (originalActions) {
      form.insertBefore(footer, originalActions);
    } else {
      const panel = $id('apptTabAppointment');
      if (panel) panel.appendChild(footer);
    }

    return footer;
  }

  /* ─────────────────── Step logic ────────────────────────── */

  function goToStep(step) {
    step = Math.max(0, Math.min(STEP_DEFS.length - 1, step));
    currentStep = step;

    // Show/hide sections
    stepSections.forEach((group, idx) => {
      const isActive = idx === currentStep;
      group.forEach(el => {
        if (isActive) {
          el.classList.remove('tv-step--hidden');
          el.classList.add('tv-step--active');
        } else {
          el.classList.remove('tv-step--active');
          el.classList.add('tv-step--hidden');
        }
      });
    });

    // Update progress dots & connectors
    STEP_DEFS.forEach((_, i) => {
      const dot     = $id(`tvStepDot${i}`);
      const conn    = $id(`tvStepConn${i}`);
      const numEl   = dot?.querySelector('.tv-dot-num');
      const checkEl = dot?.querySelector('.tv-dot-check');

      if (!dot) return;

      dot.classList.remove('active', 'done');

      if (i < currentStep) {
        dot.classList.add('done');
        if (numEl)   numEl.style.display   = 'none';
        if (checkEl) checkEl.style.display = 'inline';
      } else if (i === currentStep) {
        dot.classList.add('active');
        if (numEl)   numEl.style.display   = 'inline';
        if (checkEl) checkEl.style.display = 'none';
      } else {
        if (numEl)   numEl.style.display   = 'inline';
        if (checkEl) checkEl.style.display = 'none';
      }

      if (conn) conn.classList.toggle('done', i < currentStep);
    });

    // Update label
    const label = $id('tvStepLabel');
    if (label) {
      label.textContent = `${currentStep + 1}/${STEP_DEFS.length} — ${STEP_DEFS[currentStep].label}`;
    }

    // Update ARIA
    const progressEl = stepperHeader?.querySelector('[role="progressbar"]');
    if (progressEl) progressEl.setAttribute('aria-valuenow', String(currentStep + 1));

    // Toggle navigation buttons
    const prevBtn = $id('tvStepPrev');
    const nextBtn = $id('tvStepNext');
    const saveBtn = $id('tvStepSave');
    const isLast  = currentStep === STEP_DEFS.length - 1;
    const isFirst = currentStep === 0;

    if (prevBtn) {
      prevBtn.disabled = isFirst;
      prevBtn.setAttribute('aria-disabled', String(isFirst));
    }
    if (nextBtn) nextBtn.style.display = isLast  ? 'none' : '';
    if (saveBtn) saveBtn.style.display = isLast  ? ''     : 'none';

    // Scroll panel into view smoothly
    stepperHeader?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ─────────────────── Responsive switch ─────────────────── */

  function handleResize() {
    const wasDesktop = !isMobile;
    isMobile = window.innerWidth < MOBILE_BREAKPOINT;

    if (isMobile) {
      // Mobile: show stepper chrome, hide original save bar
      if (stepperHeader) stepperHeader.style.removeProperty('display');
      if (stepperFooter) stepperFooter.style.removeProperty('display');
      if (originalActions) {
        originalActions.style.display = 'none';
        originalActions.classList.add('appt-form__actions--stepper-replaced');
      }
      goToStep(currentStep);  // re-apply section visibility
    } else {
      // Desktop: hide stepper chrome, show all sections + original save bar
      if (stepperHeader) stepperHeader.style.display = 'none';
      if (stepperFooter) stepperFooter.style.display = 'none';
      if (originalActions) {
        originalActions.style.removeProperty('display');
        originalActions.classList.remove('appt-form__actions--stepper-replaced');
      }
      // Show all step sections
      stepSections.forEach(group => {
        group.forEach(el => {
          el.classList.remove('tv-step--hidden', 'tv-step--active');
          el.style.removeProperty('display');
        });
      });
    }
  }

  /* ─────────────────── Bootstrap ─────────────────────────── */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already ready — wait one tick for other modules to initialise
    setTimeout(init, 0);
  }

})();
