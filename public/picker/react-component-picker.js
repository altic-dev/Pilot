/**
 * React Component Picker
 *
 * Standalone script injected into iframe that enables visual component selection
 * using React Fiber tree inspection.
 */

(function() {
  'use strict';

  class ReactComponentPicker {
    constructor() {
      this.isActive = false;
      this.overlay = null;
      this.tooltip = null;
      this.currentElement = null;
      this.boundMouseOver = this.handleMouseOver.bind(this);
      this.boundClick = this.handleClick.bind(this);
      this.boundKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Activate selection mode
     */
    activate() {
      if (this.isActive) return;

      this.isActive = true;
      this.createOverlay();
      this.createTooltip();

      document.addEventListener('mouseover', this.boundMouseOver, true);
      document.addEventListener('click', this.boundClick, true);
      document.addEventListener('keydown', this.boundKeyDown, true);

      document.body.style.cursor = 'crosshair';

      console.log('[Pilot Picker] Selection mode activated');
    }

    /**
     * Deactivate selection mode
     */
    deactivate() {
      if (!this.isActive) return;

      this.isActive = false;

      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }

      if (this.tooltip) {
        this.tooltip.remove();
        this.tooltip = null;
      }

      document.removeEventListener('mouseover', this.boundMouseOver, true);
      document.removeEventListener('click', this.boundClick, true);
      document.removeEventListener('keydown', this.boundKeyDown, true);

      document.body.style.cursor = '';

      console.log('[Pilot Picker] Selection mode deactivated');
    }

    /**
     * Create overlay element for highlighting
     */
    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.id = '__pilot-picker-overlay';
      this.overlay.style.cssText = `
        position: absolute;
        pointer-events: none;
        z-index: 999999;
        background: rgba(59, 130, 246, 0.2);
        border: 2px solid rgb(59, 130, 246);
        border-radius: 4px;
        transition: all 0.1s ease;
        display: none;
      `;
      document.body.appendChild(this.overlay);
    }

    /**
     * Create tooltip element for component name display
     */
    createTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.id = '__pilot-picker-tooltip';
      this.tooltip.style.cssText = `
        position: absolute;
        pointer-events: none;
        z-index: 1000000;
        background: rgb(59, 130, 246);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: monospace;
        white-space: nowrap;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      `;
      document.body.appendChild(this.tooltip);
    }

    /**
     * Handle mouse over events
     */
    handleMouseOver(event) {
      if (!this.isActive) return;

      event.preventDefault();
      event.stopPropagation();

      const element = event.target;
      if (!element || element === this.currentElement) return;

      this.currentElement = element;
      this.highlightElement(element);
    }

    /**
     * Handle click events
     */
    handleClick(event) {
      if (!this.isActive) return;

      event.preventDefault();
      event.stopPropagation();

      const element = event.target;
      if (!element) return;

      try {
        const componentInfo = this.extractComponentInfo(element);
        this.sendToParent(componentInfo);
        this.deactivate();
      } catch (error) {
        console.error('[Pilot Picker] Error extracting component info:', error);
        this.sendError('Failed to extract component information');
        this.deactivate();
      }
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(event) {
      if (!this.isActive) return;

      // Escape key to cancel
      if (event.key === 'Escape') {
        event.preventDefault();
        this.deactivate();
        this.sendToParent({ type: 'picker-cancelled' });
      }
    }

    /**
     * Highlight the given element
     */
    highlightElement(element) {
      if (!this.overlay || !this.tooltip) return;

      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Position overlay
      this.overlay.style.display = 'block';
      this.overlay.style.left = (rect.left + scrollX) + 'px';
      this.overlay.style.top = (rect.top + scrollY) + 'px';
      this.overlay.style.width = rect.width + 'px';
      this.overlay.style.height = rect.height + 'px';

      // Get component name for tooltip
      const component = this.getReactComponent(element);
      const componentName = component?.name || element.tagName.toLowerCase();

      // Position tooltip
      this.tooltip.style.display = 'block';
      this.tooltip.textContent = componentName;

      const tooltipX = rect.left + scrollX;
      const tooltipY = rect.top + scrollY - 25;

      this.tooltip.style.left = tooltipX + 'px';
      this.tooltip.style.top = (tooltipY > 0 ? tooltipY : rect.bottom + scrollY + 5) + 'px';
    }

    /**
     * Find React component from DOM element using Fiber tree
     */
    getReactComponent(element) {
      try {
        // Find React Fiber key
        const fiberKey = Object.keys(element).find(key =>
          key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
        );

        if (!fiberKey) return null;

        let fiber = element[fiberKey];

        // Traverse up Fiber tree to find component fiber (not DOM)
        while (fiber) {
          // Function components or class components have type as a function
          if (fiber.type && typeof fiber.type === 'function') {
            return {
              name: this.getComponentName(fiber.type),
              props: fiber.memoizedProps || {},
              fiber: fiber
            };
          }

          // Move up the tree
          fiber = fiber.return;
        }

        return null;
      } catch (error) {
        console.warn('[Pilot Picker] Error accessing React Fiber:', error);
        return null;
      }
    }

    /**
     * Get component name from component type
     */
    getComponentName(type) {
      return type.displayName || type.name || 'Anonymous';
    }

    /**
     * Extract all component information
     */
    extractComponentInfo(element) {
      const component = this.getReactComponent(element);
      const rect = element.getBoundingClientRect();

      return {
        // React metadata
        componentName: component?.name || element.tagName.toLowerCase(),
        props: component ? this.sanitizeProps(component.props) : {},

        // DOM info
        tagName: element.tagName.toLowerCase(),
        selector: this.generateSelector(element),
        className: element.className,
        id: element.id,

        // Content
        text: this.getVisibleText(element),
        ariaLabel: element.getAttribute('aria-label'),
        title: element.getAttribute('title'),
        placeholder: element.getAttribute('placeholder'),
        type: element.getAttribute('type'),

        // Visual context
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right
        },

        // Hierarchy
        hierarchy: this.buildHierarchy(component?.fiber || null),

        // Timestamp
        timestamp: new Date().toISOString()
      };
    }

    /**
     * Sanitize props - remove functions and circular references
     */
    sanitizeProps(props) {
      const sanitized = {};
      const seen = new WeakSet();

      const sanitize = (obj, depth = 0) => {
        if (depth > 3) return '[Max Depth]';
        if (obj === null || obj === undefined) return obj;

        const type = typeof obj;

        if (type === 'function') return '[Function]';
        if (type !== 'object') return obj;

        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        if (Array.isArray(obj)) {
          return obj.slice(0, 10).map(item => sanitize(item, depth + 1));
        }

        const result = {};
        const keys = Object.keys(obj).slice(0, 20); // Limit keys

        for (const key of keys) {
          if (key.startsWith('__')) continue; // Skip internal props
          try {
            result[key] = sanitize(obj[key], depth + 1);
          } catch (e) {
            result[key] = '[Error]';
          }
        }

        return result;
      };

      return sanitize(props);
    }

    /**
     * Generate unique CSS selector for element
     */
    generateSelector(element) {
      if (element.id) return `#${element.id}`;

      const path = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let selector = current.nodeName.toLowerCase();

        if (current.id) {
          selector = `#${current.id}`;
          path.unshift(selector);
          break;
        }

        if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith('__pilot'));
          if (classes.length > 0) {
            selector += '.' + classes.slice(0, 3).join('.');
          }
        }

        // Add nth-child if needed for uniqueness
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            child => child.nodeName === current.nodeName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-child(${index})`;
          }
        }

        path.unshift(selector);
        current = current.parentElement;

        if (path.length > 5) break; // Limit path length
      }

      return path.join(' > ');
    }

    /**
     * Get visible text content from element
     */
    getVisibleText(element) {
      // Get text content but exclude script and style tags
      const clone = element.cloneNode(true);
      const scripts = clone.querySelectorAll('script, style');
      scripts.forEach(s => s.remove());

      let text = clone.textContent || clone.innerText || '';
      text = text.replace(/\s+/g, ' ').trim();

      // Limit length
      return text.length > 200 ? text.slice(0, 200) + '...' : text;
    }

    /**
     * Build component hierarchy from Fiber tree
     */
    buildHierarchy(fiber) {
      if (!fiber) return [];

      const hierarchy = [];
      let current = fiber;
      let depth = 0;
      const maxDepth = 5;

      while (current && depth < maxDepth) {
        if (current.type && typeof current.type === 'function') {
          hierarchy.unshift({
            name: this.getComponentName(current.type),
            type: 'component'
          });
          depth++;
        } else if (current.type && typeof current.type === 'string') {
          hierarchy.unshift({
            name: current.type,
            type: 'element'
          });
        }

        current = current.return;
      }

      return hierarchy;
    }

    /**
     * Send component info to parent window
     */
    sendToParent(data) {
      try {
        window.parent.postMessage({
          type: 'component-selected',
          data: data
        }, '*'); // Will be validated by parent

        console.log('[Pilot Picker] Component sent to parent:', data);
      } catch (error) {
        console.error('[Pilot Picker] Error sending to parent:', error);
      }
    }

    /**
     * Send error to parent window
     */
    sendError(message) {
      try {
        window.parent.postMessage({
          type: 'picker-error',
          error: message
        }, '*');
      } catch (error) {
        console.error('[Pilot Picker] Error sending error to parent:', error);
      }
    }
  }

  // Initialize picker instance
  if (!window.__pilotReactPicker) {
    window.__pilotReactPicker = new ReactComponentPicker();

    // Listen for messages from parent window
    window.addEventListener('message', function(event) {
      // Basic origin validation - will be enhanced by parent
      if (event.data && event.data.type === 'activate-picker') {
        window.__pilotReactPicker.activate();
      } else if (event.data && event.data.type === 'deactivate-picker') {
        window.__pilotReactPicker.deactivate();
      }
    });

    // Notify parent that picker is ready
    try {
      window.parent.postMessage({
        type: 'picker-ready',
        timestamp: new Date().toISOString()
      }, '*');
    } catch (error) {
      console.error('[Pilot Picker] Error notifying parent:', error);
    }

    console.log('[Pilot Picker] React Component Picker initialized');
  }
})();
