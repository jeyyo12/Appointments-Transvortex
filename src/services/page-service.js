/**
 * Page Service
 * 
 * Business logic for page management operations.
 */

import { eventBus, EVENT_TYPES } from '../core/event-bus.js';
import { showSuccess, showError } from '../utils/notifications.js';

export class PageService {
  constructor(firebaseService, authService) {
    this.firebase = firebaseService;
    this.auth = authService;
  }

  /**
   * Create new page
   * @param {Object} data - Page data
   * @returns {Promise<string>} New page ID
   */
  async createPage(data) {
    try {
      if (!this.auth.isAdmin()) {
        throw new Error('Only admins can create pages');
      }

      const pageId = await this.firebase.createPage({
        ...data,
        createdBy: this.auth.getCurrentUser()?.uid
      });

      eventBus.emit(EVENT_TYPES.PAGE_CREATED, { pageId, data });
      showSuccess('✅ Pagină creată cu succes');
      
      return pageId;
    } catch (error) {
      console.error('Error creating page:', error);
      showError('❌ Eroare la creare pagină');
      throw error;
    }
  }

  /**
   * Update page
   * @param {string} id - Page ID
   * @param {Object} data - Updated data
   * @returns {Promise<void>}
   */
  async updatePage(id, data) {
    try {
      if (!this.auth.isAdmin()) {
        throw new Error('Only admins can update pages');
      }

      await this.firebase.updatePage(id, data);

      eventBus.emit(EVENT_TYPES.PAGE_UPDATED, { pageId: id, data });
      showSuccess('✅ Pagină actualizată');
    } catch (error) {
      console.error('Error updating page:', error);
      showError('❌ Eroare la actualizare');
      throw error;
    }
  }

  /**
   * Mark page as posted
   * @param {string} id - Page ID
   * @returns {Promise<void>}
   */
  async markAsPosted(id) {
    try {
      if (!this.auth.isAdmin()) {
        throw new Error('Only admins can mark pages as posted');
      }

      const serverTimestamp = await this.firebase.getServerTimestamp();
      
      await this.firebase.updatePage(id, {
        posted: true,
        postedAt: serverTimestamp,
        postedBy: this.auth.getCurrentUser()?.uid
      });

      eventBus.emit(EVENT_TYPES.PAGE_POSTED, { pageId: id });
      showSuccess('✅ Marcat ca postat');
    } catch (error) {
      console.error('Error marking page as posted:', error);
      showError('❌ Eroare la marcare');
      throw error;
    }
  }

  /**
   * Mark page as unposted
   * @param {string} id - Page ID
   * @returns {Promise<void>}
   */
  async markAsUnposted(id) {
    try {
      if (!this.auth.isAdmin()) {
        throw new Error('Only admins can mark pages as unposted');
      }

      await this.firebase.updatePage(id, {
        posted: false,
        postedAt: null,
        postedBy: null
      });

      eventBus.emit(EVENT_TYPES.PAGE_UNPOSTED, { pageId: id });
      showSuccess('✅ Marcat ca nepostat');
    } catch (error) {
      console.error('Error marking page as unposted:', error);
      showError('❌ Eroare la marcare');
      throw error;
    }
  }

  /**
   * Delete page
   * @param {string} id - Page ID
   * @returns {Promise<void>}
   */
  async deletePage(id) {
    try {
      if (!this.auth.isAdmin()) {
        throw new Error('Only admins can delete pages');
      }

      await this.firebase.deletePage(id);

      eventBus.emit(EVENT_TYPES.PAGE_DELETED, { pageId: id });
      showSuccess('✅ Pagină ștearsă');
    } catch (error) {
      console.error('Error deleting page:', error);
      showError('❌ Eroare la ștergere');
      throw error;
    }
  }

  /**
   * Subscribe to pages real-time updates
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToPages(callback) {
    return this.firebase.subscribeToPages((pages) => {
      eventBus.emit(EVENT_TYPES.PAGES_LOADED, { pages });
      callback(pages);
    });
  }

  /**
   * Get all pages
   * @returns {Promise<Array>} Pages array
   */
  async getPages() {
    return await this.firebase.getPages();
  }

  /**
   * Save draft to localStorage
   * @param {Object} draft - Draft data
   */
  saveDraft(draft) {
    try {
      localStorage.setItem('tvx.pageDraft', JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }

  /**
   * Load draft from localStorage
   * @returns {Object|null} Draft data or null
   */
  loadDraft() {
    try {
      const draft = localStorage.getItem('tvx.pageDraft');
      return draft ? JSON.parse(draft) : null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }

  /**
   * Clear draft from localStorage
   */
  clearDraft() {
    try {
      localStorage.removeItem('tvx.pageDraft');
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }
}
