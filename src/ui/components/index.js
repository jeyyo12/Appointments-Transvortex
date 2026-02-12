/**
 * Modal Components - Central Export
 * 
 * Exports all modal components and the modal manager.
 */

export { BaseModal, ModalManager, modalManager } from './base-modal.js';
export { DetailsModal } from './details-modal.js';
export { FinalizeModal } from './finalize-modal.js';

/**
 * Register all modals with the modal manager
 */
import { modalManager } from './base-modal.js';
import { DetailsModal } from './details-modal.js';
import { FinalizeModal } from './finalize-modal.js';

// Register modal types
modalManager.register('details', DetailsModal);
modalManager.register('finalize', FinalizeModal);

export default modalManager;
