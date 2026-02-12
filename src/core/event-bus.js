/**
 * Centralized Event Bus
 * 
 * Replaces scattered event handling with a unified pub/sub system.
 * All application events flow through this bus for consistency and debuggability.
 */

import { EVENT_TYPES } from '../config/constants.js';

/**
 * EventBus - Centralized event management
 */
class EventBus {
  constructor() {
    this._handlers = new Map();
    this._eventLog = [];
    this._maxLogSize = 100;
    this._debugMode = false;
  }

  /**
   * Subscribe to an event
   * @param {string} eventType - Event type to listen for
   * @param {Function} handler - Handler function (receives event data)
   * @param {Object} options - Options { once: boolean, priority: number }
   * @returns {Function} Unsubscribe function
   */
  on(eventType, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('Event handler must be a function');
    }

    if (!this._handlers.has(eventType)) {
      this._handlers.set(eventType, []);
    }

    const handlerInfo = {
      handler,
      once: options.once || false,
      priority: options.priority || 0,
      id: Symbol('handler')
    };

    const handlers = this._handlers.get(eventType);
    handlers.push(handlerInfo);

    // Sort by priority (higher priority runs first)
    handlers.sort((a, b) => b.priority - a.priority);

    if (this._debugMode) {
      console.log(`[EventBus] Subscribed to "${eventType}"`, { 
        handlersCount: handlers.length,
        options 
      });
    }

    // Return unsubscribe function
    return () => this.off(eventType, handlerInfo.id);
  }

  /**
   * Subscribe to an event once
   * @param {string} eventType - Event type to listen for
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   */
  once(eventType, handler) {
    return this.on(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventType - Event type
   * @param {Symbol} handlerId - Handler ID returned from on()
   */
  off(eventType, handlerId) {
    const handlers = this._handlers.get(eventType);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.id === handlerId);
    if (index !== -1) {
      handlers.splice(index, 1);
      
      if (handlers.length === 0) {
        this._handlers.delete(eventType);
      }

      if (this._debugMode) {
        console.log(`[EventBus] Unsubscribed from "${eventType}"`, {
          remainingHandlers: handlers.length
        });
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   * @returns {Promise<void>}
   */
  async emit(eventType, data = null) {
    const handlers = this._handlers.get(eventType);
    
    // Log event
    this._logEvent(eventType, data);

    if (this._debugMode) {
      console.log(`[EventBus] Emitting "${eventType}"`, {
        data,
        handlersCount: handlers?.length || 0
      });
    }

    if (!handlers || handlers.length === 0) {
      return;
    }

    // Create event object
    const event = {
      type: eventType,
      data,
      timestamp: Date.now(),
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };

    // Execute handlers in priority order
    const handlersToRemove = [];
    
    for (const handlerInfo of handlers) {
      try {
        await handlerInfo.handler(event);
        
        // Mark for removal if once
        if (handlerInfo.once) {
          handlersToRemove.push(handlerInfo.id);
        }

        // Stop propagation if prevented
        if (event.defaultPrevented) {
          break;
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for "${eventType}":`, error);
      }
    }

    // Remove one-time handlers
    handlersToRemove.forEach(id => this.off(eventType, id));
  }

  /**
   * Emit event synchronously (use sparingly)
   * @param {string} eventType - Event type
   * @param {*} data - Event data
   */
  emitSync(eventType, data = null) {
    const handlers = this._handlers.get(eventType);
    
    this._logEvent(eventType, data);

    if (this._debugMode) {
      console.log(`[EventBus] Emitting sync "${eventType}"`, {
        data,
        handlersCount: handlers?.length || 0
      });
    }

    if (!handlers || handlers.length === 0) {
      return;
    }

    const event = {
      type: eventType,
      data,
      timestamp: Date.now(),
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };

    const handlersToRemove = [];

    for (const handlerInfo of handlers) {
      try {
        handlerInfo.handler(event);
        
        if (handlerInfo.once) {
          handlersToRemove.push(handlerInfo.id);
        }

        if (event.defaultPrevented) {
          break;
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for "${eventType}":`, error);
      }
    }

    handlersToRemove.forEach(id => this.off(eventType, id));
  }

  /**
   * Remove all handlers for an event type
   * @param {string} eventType - Event type (or omit to clear all)
   */
  clear(eventType = null) {
    if (eventType) {
      this._handlers.delete(eventType);
    } else {
      this._handlers.clear();
    }
  }

  /**
   * Log event for debugging
   * @private
   */
  _logEvent(eventType, data) {
    this._eventLog.push({
      type: eventType,
      data,
      timestamp: Date.now()
    });

    // Keep log size manageable
    if (this._eventLog.length > this._maxLogSize) {
      this._eventLog.shift();
    }
  }

  /**
   * Get event log (for debugging)
   * @param {number} limit - Max events to return
   * @returns {Array} Recent events
   */
  getEventLog(limit = 20) {
    return this._eventLog.slice(-limit);
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled - Debug mode enabled
   */
  setDebugMode(enabled) {
    this._debugMode = enabled;
    console.log(`[EventBus] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get debug information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    const eventTypes = Array.from(this._handlers.keys());
    const totalHandlers = Array.from(this._handlers.values())
      .reduce((sum, handlers) => sum + handlers.length, 0);

    return {
      eventTypes,
      eventTypesCount: eventTypes.length,
      totalHandlers,
      handlersByType: Object.fromEntries(
        Array.from(this._handlers.entries())
          .map(([type, handlers]) => [type, handlers.length])
      ),
      recentEvents: this.getEventLog(10),
      debugMode: this._debugMode
    };
  }
}

// Export singleton instance
export const eventBus = new EventBus();

// Export class for testing
export { EventBus };

// Export event types for convenience
export { EVENT_TYPES };
