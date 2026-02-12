/**
 * Unified Modal System
 * 
 * Base modal class and modal manager for all modal dialogs in the application.
 * Provides consistent lifecycle, history management, keyboard handling, and focus trapping.
 */

import { appState } from '../core/app-state.js';
import { eventBus, EVENT_TYPES } from '../core/event-bus.js';

/**
 * BaseModal - Abstract base class for all modals
 */
export class BaseModal {
  constructor(props = {}) {
    this.props = props;
    this.element = null;
    this.isOpen = false;
    this.listeners = [];
    this._popHandler = null;
    this._escHandler = null;
  }

  /**
   * Render modal DOM
   * Override this in subclasses
   * @returns {HTMLElement} Modal element
   */
  render() {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Open modal
   */
  open() {
    if (this.isOpen) return;

    // Render modal
    this.element = this.render();
    if (!this.element) {
      console.error('Modal render() returned null');
      return;
    }

    // Add to DOM
    document.body.appendChild(this.element);
    document.body.classList.add('modal-open');

    // Show with transition
    requestAnimationFrame(() => {
      this.element.classList.add(this.getShowClass());
    });

    // Setup history state
    this.setupHistoryState();

    // Setup event listeners
    this.setupEventListeners();

    // Focus trap
    this.setupFocusTrap();

    // Mark as open
    this.isOpen = true;

    // Update app state
    appState.setState('modals.openModal', this);
    const stack = appState.getState('modals.modalStack') || [];
    appState.setState('modals.modalStack', [...stack, this]);

    // Emit event
    eventBus.emit(EVENT_TYPES.MODAL_OPENED, { modal: this, type: this.getType() });

    // Call lifecycle hook
    this.onOpened();
  }

  /**
   * Close modal
   * @param {boolean} triggerHistoryBack - Whether to trigger browser back
   */
  close(triggerHistoryBack = true) {
    if (!this.isOpen || !this.element) return;

    // Hide with transition
    this.element.classList.remove(this.getShowClass());

    setTimeout(() => {
      // Remove from DOM
      this.element?.remove();
      this.element = null;

      // Remove body lock if no other modals
      const hasOtherModals = document.querySelector('.modal-open');
      if (!hasOtherModals) {
        document.body.classList.remove('modal-open');
      }
    }, this.getTransitionDuration());

    // Cleanup event listeners
    this.cleanup();

    // Mark as closed
    this.isOpen = false;

    // Update app state
    const stack = appState.getState('modals.modalStack') || [];
    const newStack = stack.filter(m => m !== this);
    appState.setState('modals.modalStack', newStack);
    
    if (appState.getState('modals.openModal') === this) {
      appState.setState('modals.openModal', newStack[newStack.length - 1] || null);
    }

    // Handle history
    if (triggerHistoryBack && this._historyPushed) {
      const state = history.state;
      if (state && state.modal === this.getType()) {
        history.back();
      }
    }

    // Emit event
    eventBus.emit(EVENT_TYPES.MODAL_CLOSED, { modal: this, type: this.getType() });

    // Call lifecycle hook
    this.onClosed();
  }

  /**
   * Setup browser history state for back button support
   * @private
   */
  setupHistoryState() {
    const modalType = this.getType();
    const historyState = { modal: modalType, ...this.getHistoryData() };
    
    history.pushState(historyState, '', `#${modalType}`);
    this._historyPushed = true;

    // Handle popstate (back button)
    this._popHandler = (event) => {
      if (this.isOpen) {
        this.close(false);
      }
    };

    window.addEventListener('popstate', this._popHandler);
  }

  /**
   * Setup event listeners (close buttons, backdrop, ESC key)
   * @private
   */
  setupEventListeners() {
    if (!this.element) return;

    // Close button
    const closeBtn = this.element.querySelector('[data-action="close"]');
    if (closeBtn) {
      const closeHandler = () => this.close();
      closeBtn.addEventListener('click', closeHandler);
      this.listeners.push({ element: closeBtn, event: 'click', handler: closeHandler });
    }

    // Backdrop click
    const backdrop = this.element.querySelector('[class*="backdrop"]');
    if (backdrop && this.shouldCloseOnBackdrop()) {
      const backdropHandler = (e) => {
        if (e.target === backdrop) {
          this.close();
        }
      };
      backdrop.addEventListener('click', backdropHandler);
      this.listeners.push({ element: backdrop, event: 'click', handler: backdropHandler });
    }

    // ESC key
    if (this.shouldCloseOnEscape()) {
      this._escHandler = (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      };
      document.addEventListener('keydown', this._escHandler);
    }

    // Custom event listeners
    this.attachEventListeners();
  }

  /**
   * Setup focus trap
   * @private
   */
  setupFocusTrap() {
    if (!this.element) return;

    requestAnimationFrame(() => {
      const focusable = this.element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length > 0) {
        focusable[0].focus();
      }
    });
  }

  /**
   * Cleanup event listeners
   * @private
   */
  cleanup() {
    // Remove custom listeners
    this.listeners.forEach(({ element, event, handler }) => {
      element?.removeEventListener(event, handler);
    });
    this.listeners = [];

    // Remove popstate handler
    if (this._popHandler) {
      window.removeEventListener('popstate', this._popHandler);
      this._popHandler = null;
    }

    // Remove ESC handler
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    // Custom cleanup
    this.onCleanup();
  }

  /**
   * Get modal type identifier
   * Override in subclasses
   * @returns {string} Modal type
   */
  getType() {
    return 'base';
  }

  /**
   * Get CSS class for show state
   * Override in subclasses if needed
   * @returns {string} Show class name
   */
  getShowClass() {
    return 'modal--show';
  }

  /**
   * Get transition duration in ms
   * @returns {number} Duration in milliseconds
   */
  getTransitionDuration() {
    return 300;
  }

  /**
   * Get history state data
   * Override in subclasses to add custom data
   * @returns {Object} History state data
   */
  getHistoryData() {
    return {};
  }

  /**
   * Should modal close on backdrop click?
   * @returns {boolean}
   */
  shouldCloseOnBackdrop() {
    return true;
  }

  /**
   * Should modal close on ESC key?
   * @returns {boolean}
   */
  shouldCloseOnEscape() {
    return true;
  }

  /**
   * Attach custom event listeners
   * Override in subclasses
   */
  attachEventListeners() {
    // Override in subclasses
  }

  /**
   * Lifecycle: Called after modal is opened
   * Override in subclasses
   */
  onOpened() {
    // Override in subclasses
  }

  /**
   * Lifecycle: Called after modal is closed
   * Override in subclasses
   */
  onClosed() {
    // Override in subclasses
  }

  /**
   * Lifecycle: Called during cleanup
   * Override in subclasses
   */
  onCleanup() {
    // Override in subclasses
  }
}

/**
 * ModalManager - Manages all modals in the application
 */
export class ModalManager {
  constructor() {
    this.modals = new Map();
    this.instances = [];
  }

  /**
   * Register a modal class
   * @param {string} type - Modal type identifier
   * @param {class} ModalClass - Modal class (extends BaseModal)
   */
  register(type, ModalClass) {
    this.modals.set(type, ModalClass);
  }

  /**
   * Open a modal
   * @param {string} type - Modal type
   * @param {Object} props - Props to pass to modal
   * @returns {BaseModal} Modal instance
   */
  open(type, props = {}) {
    const ModalClass = this.modals.get(type);
    
    if (!ModalClass) {
      console.error(`Modal type "${type}" not registered`);
      return null;
    }

    const instance = new ModalClass(props);
    this.instances.push(instance);
    instance.open();
    
    return instance;
  }

  /**
   * Close a specific modal instance
   * @param {BaseModal} instance - Modal instance
   */
  close(instance) {
    instance.close();
    this.instances = this.instances.filter(m => m !== instance);
  }

  /**
   * Close all open modals
   */
  closeAll() {
    [...this.instances].forEach(instance => {
      instance.close();
    });
    this.instances = [];
  }

  /**
   * Get currently open modal
   * @returns {BaseModal|null} Active modal instance
   */
  getActiveModal() {
    return this.instances[this.instances.length - 1] || null;
  }

  /**
   * Check if any modal is open
   * @returns {boolean} True if modal is open
   */
  hasOpenModal() {
    return this.instances.length > 0;
  }
}

// Export singleton instance
export const modalManager = new ModalManager();
