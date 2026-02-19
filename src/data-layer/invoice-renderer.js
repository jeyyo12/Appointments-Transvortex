/**
 * INVOICE RENDERER - OPTIMIZED RENDERING FOR iPhone
 * 
 * Renders invoice items incrementally using:
 * - Batch rendering (N items per frame)
 * - requestAnimationFrame for smooth 60fps
 * - Virtualization for huge lists
 * - Event delegation for reduced memory
 */

class InvoiceRenderer {
  constructor() {
    this.batchSize = 10; // Items per frame
    this.renderTimeout = null;
    this.measuredHeight = new Map(); // Cache row heights
  }
  
  /**
   * Render invoices in batches for performance
   * @param {Array} invoices - List of invoices to render
   * @param {string} containerId - ID of container to render into
   * @param {Function} renderItem - Function to render single invoice (returns HTML string)
   * @param {Object} options - Additional options
   */
  renderIncrmental(invoices, containerId, renderItem, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('❌ Invoice container not found:', containerId);
      return;
    }
    
    const { virtualizeThreshold = 100, onProgress = null } = options;
    
    // Clear container
    container.innerHTML = '';
    
    // For small lists, render all at once
    if (invoices.length < virtualizeThreshold) {
      this.renderBatch(invoices, renderItem, 0, invoices.length, container, onProgress);
      return;
    }
    
    // For large lists, batch and virtualize
    let rendered = 0;
    const totalBatches = Math.ceil(invoices.length / this.batchSize);
    
    const renderNextBatch = () => {
      const start = rendered;
      const end = Math.min(rendered + this.batchSize, invoices.length);
      
      this.renderBatch(
        invoices.slice(start, end),
        renderItem,
        start,
        end,
        container,
        onProgress && (() => onProgress(end, invoices.length))
      );
      
      rendered = end;
      
      if (rendered < invoices.length) {
        // Schedule next batch
        requestAnimationFrame(renderNextBatch);
      }
    };
    
    // Start batching
    renderNextBatch();
  }
  
  /**
   * Render a single batch of invoices
   * @private
   */
  renderBatch(items, renderItem, startIdx, endIdx, container, onProgress) {
    const fragment = document.createDocumentFragment();
    
    items.forEach((item, idx) => {
      try {
        const html = renderItem(item, startIdx + idx);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        fragment.appendChild(wrapper.firstElementChild || wrapper);
      } catch (error) {
        console.error('❌ Error rendering invoice item:', error, item);
      }
    });
    
    container.appendChild(fragment);
    
    if (onProgress) {
      onProgress();
    }
  }
  
  /**
   * Virtualized rendering for very large lists (e.g., 10k+ items)
   * Only renders visible items + buffer
   * @param {Array} invoices
   * @param {string} containerId
   * @param {Function} renderItem
   * @param {number} itemHeight - Approximate height of each row (pixels)
   */
  renderVirtualized(invoices, containerId, renderItem, itemHeight = 100) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('❌ Invoice container not found:', containerId);
      return;
    }
    
    const viewport = container.parentElement;
    if (!viewport) {
      console.error('❌ Viewport not found for virtualization');
      return;
    }
    
    // Create spacers and content area
    let topSpacer = container.querySelector('.top-spacer');
    let contentArea = container.querySelector('.content-area');
    let bottomSpacer = container.querySelector('.bottom-spacer');
    
    if (!topSpacer) {
      topSpacer = document.createElement('div');
      topSpacer.className = 'top-spacer';
      container.appendChild(topSpacer);
    }
    
    if (!contentArea) {
      contentArea = document.createElement('div');
      contentArea.className = 'content-area';
      container.appendChild(contentArea);
    }
    
    if (!bottomSpacer) {
      bottomSpacer = document.createElement('div');
      bottomSpacer.className = 'bottom-spacer';
      container.appendChild(bottomSpacer);
    }
    
    // Calculate visible range
    const updateVisibleRange = () => {
      const scrollTop = viewport.scrollTop;
      const viewportHeight = viewport.clientHeight;
      const buffer = viewportHeight; // Render 1 extra viewport above/below
      
      const startIdx = Math.max(0, Math.floor((scrollTop - buffer) / itemHeight));
      const endIdx = Math.min(invoices.length, Math.ceil((scrollTop + viewportHeight + buffer) / itemHeight));
      
      // Update spacers
      topSpacer.style.height = `${startIdx * itemHeight}px`;
      bottomSpacer.style.height = `${Math.max(0, (invoices.length - endIdx) * itemHeight)}px`;
      
      // Render visible items
      const visibleItems = invoices.slice(startIdx, endIdx);
      contentArea.innerHTML = '';
      
      const fragment = document.createDocumentFragment();
      visibleItems.forEach((item, idx) => {
        try {
          const html = renderItem(item, startIdx + idx);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          fragment.appendChild(wrapper.firstElementChild || wrapper);
        } catch (error) {
          console.error('❌ Error rendering virtualized item:', error);
        }
      });
      
      contentArea.appendChild(fragment);
    };
    
    // Initial render
    updateVisibleRange();
    
    // Update on scroll
    viewport.addEventListener('scroll', () => {
      requestAnimationFrame(updateVisibleRange);
    }, { passive: true });
    
    console.log(`✅ Virtualized renderer initialized (${invoices.length} items, ~${itemHeight}px each)`);
  }
  
  /**
   * Apply event delegation for invoice item actions
   * Prevents N listener attachments for N items
   * @param {string} containerId
   * @param {Object} handlers - { eventType: { selector: handlerFn } }
   */
  applyEventDelegation(containerId, handlers) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('❌ Container not found for event delegation:', containerId);
      return;
    }
    
    // Single listener per event type
    Object.entries(handlers).forEach(([eventType, selectors]) => {
      container.addEventListener(eventType, (e) => {
        Object.entries(selectors).forEach(([selector, handler]) => {
          const target = e.target.closest(selector);
          if (target) {
            try {
              handler.call(target, e);
            } catch (error) {
              console.error('❌ Event delegation handler error:', error, selector);
            }
          }
        });
      });
    });
    
    console.log(`✅ Event delegation applied to ${containerId}`);
  }
  
  /**
   * Optimize list scrolling with content-visibility
   * CSS containment for huge performance boost
   */
  applyScrollOptimization(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Add CSS containment on items
    container.querySelectorAll('[data-invoice-id]').forEach(item => {
      item.style.contain = 'content'; // Layout containment
      item.style.willChange = 'transform, opacity';
    });
    
    // Intersection Observer for lazy render off-screen items
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.pointerEvents = 'auto';
          } else {
            // Fade out but keep rendered for smooth scroll
            entry.target.style.opacity = '0.1';
            entry.target.style.pointerEvents = 'none';
          }
        });
      },
      { rootMargin: '50px' }
    );
    
    container.querySelectorAll('[data-invoice-id]').forEach(item => {
      observer.observe(item);
    });
    
    console.log(`✅ Scroll optimization applied (${container.querySelectorAll('[data-invoice-id]').length} items)`);
  }
  
  /**
   * Measure and cache query performance
   */
  measureRenderTime() {
    const stats = {
      lastRenderTime: 0,
      totalRenderTime: 0,
      renderCount: 0
    };
    
    return {
      start: () => {
        return performance.now();
      },
      end: (startTime) => {
        const duration = performance.now() - startTime;
        stats.lastRenderTime = duration;
        stats.totalRenderTime += duration;
        stats.renderCount++;
        
        if (duration > 16.67) { // 60fps = 16.67ms per frame
          console.warn(`⚠️ Render took ${duration.toFixed(2)}ms (exceeds 60fps budget)`);
        }
        
        return stats;
      },
      getStats: () => stats
    };
  }
}

// Create singleton instance
const invoiceRenderer = new InvoiceRenderer();

export { invoiceRenderer };
export default invoiceRenderer;
