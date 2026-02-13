/**
 * DOM Utilities
 * Safe DOM manipulation and query helpers
 */

/**
 * Safely query a single element
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (default: document)
 * @returns {Element|null}
 */
export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Safely query multiple elements
 * @param {string} selector - CSS selector
 * @param {Element} parent - Parent element (default: document)
 * @returns {NodeList}
 */
export function qsa(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

/**
 * Get element by ID
 * @param {string} id - Element ID
 * @returns {Element|null}
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * Set text content safely
 * @param {Element} element - Target element
 * @param {string} text - Text content
 */
export function setText(element, text) {
  if (element) {
    element.textContent = text || '';
  }
}

/**
 * Set HTML content safely (use with caution)
 * @param {Element} element - Target element
 * @param {string} html - HTML content
 */
export function setHTML(element, html) {
  if (element) {
    element.innerHTML = html || '';
  }
}

/**
 * Set value of input element
 * @param {Element} element - Input element
 * @param {string} value - Value
 */
export function setValue(element, value) {
  if (element && 'value' in element) {
    element.value = value || '';
  }
}

/**
 * Get value of input element
 * @param {Element} element - Input element
 * @returns {string}
 */
export function getValue(element) {
  return element && 'value' in element ? element.value : '';
}

/**
 * Add class to element
 * @param {Element} element - Target element
 * @param {...string} classNames - Class names to add
 */
export function addClass(element, ...classNames) {
  if (element) {
    element.classList.add(...classNames);
  }
}

/**
 * Remove class from element
 * @param {Element} element - Target element
 * @param {...string} classNames - Class names to remove
 */
export function removeClass(element, ...classNames) {
  if (element) {
    element.classList.remove(...classNames);
  }
}

/**
 * Toggle class on element
 * @param {Element} element - Target element
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add (true) or remove (false)
 */
export function toggleClass(element, className, force) {
  if (element) {
    element.classList.toggle(className, force);
  }
}

/**
 * Show element (remove 'hidden' class)
 * @param {Element} element - Target element
 */
export function show(element) {
  removeClass(element, 'hidden');
}

/**
 * Hide element (add 'hidden' class)
 * @param {Element} element - Target element
 */
export function hide(element) {
  addClass(element, 'hidden');
}

/**
 * Create element with optional class and attributes
 * @param {string} tag - HTML tag name
 * @param {Object} options - {className, attributes, text, html}
 * @returns {Element}
 */
export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  
  if (options.className) {
    el.className = options.className;
  }
  
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  
  if (options.text) {
    el.textContent = options.text;
  }
  
  if (options.html) {
    el.innerHTML = options.html;
  }
  
  return el;
}

/**
 * Empty element (remove all children)
 * @param {Element} element - Target element
 */
export function empty(element) {
  if (element) {
    element.innerHTML = '';
  }
}

/**
 * Append children to element
 * @param {Element} parent - Parent element
 * @param {...Element} children - Child elements
 */
export function append(parent, ...children) {
  if (parent) {
    children.forEach(child => {
      if (child) parent.appendChild(child);
    });
  }
}

/**
 * Add event listener to element
 * @param {Element} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 */
export function on(element, event, handler, options) {
  if (element) {
    element.addEventListener(event, handler, options);
  }
}

/**
 * Remove event listener from element
 * @param {Element} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 */
export function off(element, event, handler) {
  if (element) {
    element.removeEventListener(event, handler);
  }
}

/**
 * Delegate event handler
 * @param {Element} parent - Parent element
 * @param {string} selector - Child selector
 * @param {string} event - Event name
 * @param {Function} handler - Event handler (receives (event, matchedElement))
 */
export function delegate(parent, selector, event, handler) {
  on(parent, event, (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler(e, target);
    }
  });
}
