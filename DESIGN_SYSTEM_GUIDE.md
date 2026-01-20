# Transvortex Design System Usage Guide

## Quick Reference

This guide shows how to use the Transvortex design system components in your HTML.

## 🎴 Cards

### Basic Card
```html
<div class="tvCard">
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</div>
```

### Compact Card (Less Padding)
```html
<div class="tvCard tvCard--compact">
  <p>Tighter spacing for dense layouts</p>
</div>
```

### Accent Card (Blue Border)
```html
<div class="tvCard tvCard--accent">
  <h3>Important Information</h3>
</div>
```

### Sticky Card (Desktop)
```html
<div class="tvCard tvCard--sticky">
  <p>Sticks to viewport on scroll (desktop only)</p>
</div>
```

### Combined Modifiers
```html
<div class="tvCard tvCard--compact tvCard--accent tvCard--sticky">
  <form>...</form>
</div>
```

## 🔘 Buttons

### Primary Button
```html
<button class="tvBtn tvBtn--primary">
  <i class="fas fa-save"></i> Save
</button>
```

### Success Button
```html
<button class="tvBtn tvBtn--success">
  <i class="fas fa-check"></i> Confirm
</button>
```

### Danger Button
```html
<button class="tvBtn tvBtn--danger">
  <i class="fas fa-trash"></i> Delete
</button>
```

### Warning Button
```html
<button class="tvBtn tvBtn--warning">
  <i class="fas fa-exclamation-triangle"></i> Cancel
</button>
```

### Ghost Button (Transparent)
```html
<button class="tvBtn tvBtn--ghost">
  <i class="fas fa-times"></i> Close
</button>
```

### Icon-Only Button
```html
<button class="tvBtn tvBtn--primary" style="padding: var(--tv-space-2);">
  <i class="fas fa-edit"></i>
</button>
```

## 📝 Form Elements

### Text Input
```html
<div class="tvField">
  <label class="tvLabel tvLabel--required">Customer Name</label>
  <input type="text" class="tvInput" id="customerName" required>
</div>
```

### Select Dropdown
```html
<div class="tvField">
  <label class="tvLabel">Location Type</label>
  <select class="tvSelect" id="locationType">
    <option value="">Select...</option>
    <option value="garage">Garage</option>
    <option value="client">Client</option>
  </select>
</div>
```

### Textarea
```html
<div class="tvField">
  <label class="tvLabel tvLabel--required">Problem Description</label>
  <textarea class="tvTextarea" rows="3" required></textarea>
</div>
```

### Input with Error State
```html
<div class="tvField tvField--error">
  <label class="tvLabel tvLabel--required">Phone Number</label>
  <input type="tel" class="tvInput" required>
  <span class="tvError">This field is required</span>
</div>
```

### Disabled Input
```html
<div class="tvField">
  <label class="tvLabel">Read-Only Field</label>
  <input type="text" class="tvInput" value="TransvortexLTD" disabled>
</div>
```

## 📐 Layout & Grid

### Responsive Grid (Auto-Fit)
```html
<div class="tvGrid">
  <div class="tvField">...</div>
  <div class="tvField">...</div>
  <div class="tvField">...</div>
</div>
```

### Two-Column Grid
```html
<div class="tvGrid" style="grid-template-columns: 1fr 1fr;">
  <div class="tvField">...</div>
  <div class="tvField">...</div>
</div>
```

### Full-Width Field in Grid
```html
<div class="tvGrid">
  <div class="tvField">...</div>
  <div class="tvField">...</div>
  <div class="tvField" style="grid-column: 1 / -1;">
    <label>Full Width</label>
    <textarea class="tvTextarea"></textarea>
  </div>
</div>
```

### Card Section (Grouped Fields)
```html
<div class="tvCard">
  <div class="tvCardSection">
    <h4 class="tvCardTitle">Client Information</h4>
    <div class="tvGrid">
      <div class="tvField">...</div>
      <div class="tvField">...</div>
    </div>
  </div>
  
  <div class="tvCardSection">
    <h4 class="tvCardTitle">Vehicle Information</h4>
    <div class="tvGrid">
      <div class="tvField">...</div>
      <div class="tvField">...</div>
    </div>
  </div>
</div>
```

## 📊 Statistics

### Stat Card
```html
<div class="tvStats">
  <i class="fas fa-calendar"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">24</span>
    <span class="tvStats__label">Total Appointments</span>
  </div>
</div>
```

### Success Stat
```html
<div class="tvStats tvStats--success">
  <i class="fas fa-check-circle"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">18</span>
    <span class="tvStats__label">Completed</span>
  </div>
</div>
```

### Warning Stat
```html
<div class="tvStats tvStats--warning">
  <i class="fas fa-clock"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">6</span>
    <span class="tvStats__label">Pending</span>
  </div>
</div>
```

## 🔔 Notifications

### Toast Notification (JavaScript)
```javascript
// Success toast
showToast('Appointment added successfully!', 'success');

// Error toast
showToast('Failed to save appointment', 'error');

// Warning toast
showToast('Please review the form', 'warning');

// Info toast
showToast('Loading data...', 'info');
```

### Toast with Custom Duration
```javascript
function showToastCustom(message, type, duration = 3000) {
  showToast(message, type);
  // Duration is handled automatically, but you can extend the function
}
```

## ✨ Animations

### Highlight Element (JavaScript)
```javascript
// Highlight an appointment row
highlightAndScrollToAppointment(appointmentId);

// Manual highlight
const element = document.querySelector('.aptRow');
element.classList.add('tvHighlight');
setTimeout(() => {
  element.classList.remove('tvHighlight');
}, 2000);
```

### Smooth Scroll to Element
```javascript
const element = document.getElementById('targetElement');
element.scrollIntoView({
  behavior: 'smooth',
  block: 'center',
  inline: 'nearest'
});
```

## 🎨 Color Utilities

### Text Colors
```html
<p class="tvText--muted">Muted gray text</p>
<p class="tvText--primary">Primary blue text</p>
<p class="tvText--success">Success green text</p>
<p class="tvText--warning">Warning yellow text</p>
<p class="tvText--danger">Danger red text</p>
```

### Background Colors
```html
<div class="tvBg--primary">Primary blue background</div>
<div class="tvBg--success">Success green background</div>
<div class="tvBg--light">Light gray background</div>
```

## 📱 Responsive Utilities

### Hide on Mobile
```html
<div class="tvHide--mobile">
  Hidden on screens < 768px
</div>
```

### Show Only on Mobile
```html
<div class="tvShow--mobile">
  Visible only on screens < 768px
</div>
```

### Responsive Spacing
```html
<div style="padding: var(--tv-space-4);">
  Responsive padding using design tokens
</div>

<div style="margin-bottom: var(--tv-space-3);">
  Responsive margin
</div>
```

## 🔧 Advanced Examples

### Complete Form Card
```html
<section class="tvCard tvCard--compact tvCard--accent">
  <h3 class="tvCardTitle">
    <i class="fas fa-calendar-plus"></i>
    Add New Appointment
  </h3>
  
  <form class="tvGrid">
    <div class="tvCardSection">
      <h4 class="tvCardTitle">Client Info</h4>
      <div class="tvGrid">
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Name</label>
          <input type="text" class="tvInput" required>
        </div>
        
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Phone</label>
          <input type="tel" class="tvInput" required>
        </div>
      </div>
    </div>
    
    <div style="grid-column: 1 / -1;">
      <button type="submit" class="tvBtn tvBtn--primary">
        <i class="fas fa-save"></i> Save Appointment
      </button>
    </div>
  </form>
</section>
```

### Action Button Group
```html
<div style="display: flex; gap: var(--tv-space-2);">
  <button class="tvBtn tvBtn--success">
    <i class="fas fa-check"></i> Approve
  </button>
  <button class="tvBtn tvBtn--danger">
    <i class="fas fa-times"></i> Reject
  </button>
  <button class="tvBtn tvBtn--ghost">
    <i class="fas fa-edit"></i> Edit
  </button>
</div>
```

### Two-Column Dashboard
```html
<div class="tvDashboard tvDashboard--twocol">
  <!-- Left Panel: Form -->
  <section class="tvCard tvCard--compact tvCard--accent tvCard--sticky">
    <form>...</form>
  </section>
  
  <!-- Right Panel: List -->
  <section>
    <div class="tvCard">...</div>
    <div class="tvCard">...</div>
  </section>
</div>
```

## 🎯 Design Tokens Reference

### Using CSS Variables
```css
/* In your custom CSS */
.my-custom-component {
  color: var(--tv-text);
  background: var(--tv-surface);
  padding: var(--tv-space-3);
  border-radius: var(--tv-radius-md);
  box-shadow: var(--tv-shadow-sm);
  transition: var(--tv-transition);
}
```

### Common Design Tokens
```css
/* Spacing */
var(--tv-space-1)  /* 0.25-0.5rem */
var(--tv-space-2)  /* 0.5-0.75rem */
var(--tv-space-3)  /* 0.75-1rem */
var(--tv-space-4)  /* 1-1.5rem */
var(--tv-space-6)  /* 1.5-2rem */

/* Colors */
var(--tv-primary)
var(--tv-success)
var(--tv-warning)
var(--tv-danger)

/* Grays */
var(--tv-gray-50)
var(--tv-gray-100)
var(--tv-gray-900)

/* Effects */
var(--tv-shadow-sm)
var(--tv-shadow-md)
var(--tv-shadow-lg)
var(--tv-radius-sm)
var(--tv-radius-md)
var(--tv-transition)
```

## ✅ Best Practices

1. **Always use design tokens** instead of hardcoded values
   - ✅ `padding: var(--tv-space-3)`
   - ❌ `padding: 12px`

2. **Use semantic class names**
   - ✅ `tvBtn--success` for positive actions
   - ❌ `greenButton`

3. **Combine modifiers for flexibility**
   - ✅ `tvCard tvCard--compact tvCard--accent`

4. **Maintain consistent spacing**
   - Use `tvGrid` for form layouts
   - Use `tvCardSection` for grouped content

5. **Validate forms with design system classes**
   - Add `tvField--error` to parent container
   - Display error in `tvError` span

6. **Use toast notifications for user feedback**
   - Success: confirmations
   - Error: validation failures
   - Warning: important notices
   - Info: process updates

## 🚀 Quick Start Checklist

- [ ] Include `styles/design-system.css` in your HTML
- [ ] Use `.tvCard` for all containers
- [ ] Use `.tvBtn tvBtn--*` for all buttons
- [ ] Use `.tvInput` / `.tvSelect` / `.tvTextarea` for forms
- [ ] Wrap form controls in `.tvField` containers
- [ ] Use `.tvGrid` for responsive layouts
- [ ] Call `showToast()` for user notifications
- [ ] Add `tvHighlight` class for attention-grabbing

---

**Questions?** Check [DESIGN_SYSTEM_IMPLEMENTATION.md](./DESIGN_SYSTEM_IMPLEMENTATION.md) for detailed implementation notes.
