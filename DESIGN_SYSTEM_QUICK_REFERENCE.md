# 🎨 Design System Quick Reference Card

## Component Usage Cheat Sheet

### Cards
```html
<!-- Basic -->
<div class="tvCard">Content</div>

<!-- Compact (tighter spacing) -->
<div class="tvCard tvCard--compact">Content</div>

<!-- With blue accent border -->
<div class="tvCard tvCard--accent">Content</div>

<!-- Sticky (stays visible on scroll - desktop only) -->
<div class="tvCard tvCard--sticky">Content</div>

<!-- Combined -->
<div class="tvCard tvCard--compact tvCard--accent tvCard--sticky">
  Content
</div>
```

### Buttons
```html
<!-- Primary (Blue) -->
<button class="tvBtn tvBtn--primary">Save</button>

<!-- Success (Green) -->
<button class="tvBtn tvBtn--success">Confirm</button>

<!-- Danger (Red) -->
<button class="tvBtn tvBtn--danger">Delete</button>

<!-- Warning (Yellow) -->
<button class="tvBtn tvBtn--warning">Cancel</button>

<!-- Ghost (Transparent) -->
<button class="tvBtn tvBtn--ghost">Close</button>

<!-- With icon -->
<button class="tvBtn tvBtn--primary">
  <i class="fas fa-save"></i> Save
</button>

<!-- Icon only -->
<button class="tvBtn tvBtn--primary" title="Edit">
  <i class="fas fa-edit"></i>
</button>
```

### Form Fields
```html
<!-- Basic input -->
<div class="tvField">
  <label class="tvLabel">Name</label>
  <input type="text" class="tvInput">
</div>

<!-- Required input -->
<div class="tvField">
  <label class="tvLabel tvLabel--required">Email</label>
  <input type="email" class="tvInput" required>
</div>

<!-- With error -->
<div class="tvField tvField--error">
  <label class="tvLabel tvLabel--required">Phone</label>
  <input type="tel" class="tvInput" required>
  <span class="tvError">Invalid phone number</span>
</div>

<!-- Select dropdown -->
<div class="tvField">
  <label class="tvLabel">Location</label>
  <select class="tvSelect">
    <option>Choose...</option>
    <option>Garage</option>
    <option>Client Home</option>
  </select>
</div>

<!-- Textarea -->
<div class="tvField">
  <label class="tvLabel tvLabel--required">Problem</label>
  <textarea class="tvTextarea" rows="3" required></textarea>
</div>

<!-- Disabled input -->
<div class="tvField">
  <label class="tvLabel">Read-Only</label>
  <input type="text" class="tvInput" value="Fixed value" disabled>
</div>
```

### Layouts
```html
<!-- Responsive grid (auto-fit columns) -->
<div class="tvGrid">
  <div class="tvField">...</div>
  <div class="tvField">...</div>
  <div class="tvField">...</div>
</div>

<!-- Two-column grid -->
<div class="tvGrid" style="grid-template-columns: 1fr 1fr;">
  <div class="tvField">...</div>
  <div class="tvField">...</div>
</div>

<!-- Full-width item in grid -->
<div class="tvGrid">
  <div class="tvField">...</div>
  <div class="tvField" style="grid-column: 1 / -1;">
    <textarea class="tvTextarea"></textarea>
  </div>
</div>

<!-- Dashboard (two-column on desktop, stacked on mobile) -->
<div class="tvDashboard tvDashboard--twocol">
  <section>Left panel content</section>
  <section>Right panel content</section>
</div>

<!-- Card with sections -->
<div class="tvCard">
  <div class="tvCardSection">
    <h4 class="tvCardTitle">Section 1</h4>
    <div class="tvGrid">
      <div class="tvField">...</div>
    </div>
  </div>
  
  <div class="tvCardSection">
    <h4 class="tvCardTitle">Section 2</h4>
    <div class="tvGrid">
      <div class="tvField">...</div>
    </div>
  </div>
</div>
```

### Statistics
```html
<!-- Basic stat -->
<div class="tvStats">
  <i class="fas fa-calendar"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">24</span>
    <span class="tvStats__label">Total Appointments</span>
  </div>
</div>

<!-- Success stat (green) -->
<div class="tvStats tvStats--success">
  <i class="fas fa-check-circle"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">18</span>
    <span class="tvStats__label">Completed</span>
  </div>
</div>

<!-- Warning stat (yellow) -->
<div class="tvStats tvStats--warning">
  <i class="fas fa-clock"></i>
  <div class="tvStats__content">
    <span class="tvStats__value">6</span>
    <span class="tvStats__label">Pending</span>
  </div>
</div>
```

## JavaScript Functions

### Toast Notifications
```javascript
// Success
showToast('Operation successful!', 'success');

// Error
showToast('Something went wrong', 'error');

// Warning
showToast('Please review', 'warning');

// Info
showToast('Loading...', 'info');
```

**Auto-features:**
- Shows for 3 seconds then auto-dismisses
- Slides in from right
- Stacks multiple toasts vertically
- Supports up to 4 types

### Highlight & Scroll
```javascript
highlightAndScrollToAppointment(appointmentId);
```

**Auto-features:**
- Finds appointment row by data-apt-id
- Smooth scrolls to center
- Adds yellow highlight animation
- Auto-removes after 2 seconds

### Form Validation
```javascript
validateField('fieldId');
```

**Features:**
- Checks if required fields are empty
- Adds .tvField--error class to parent
- Creates error message in .tvError span
- Runs on field blur

## Design Tokens (CSS Variables)

### Spacing
```css
var(--tv-space-1)   /* Extra tight */
var(--tv-space-2)   /* Tight */
var(--tv-space-3)   /* Normal */
var(--tv-space-4)   /* Wide */
var(--tv-space-6)   /* Extra wide */
```

### Colors
```css
var(--tv-primary)    /* Blue #007aff */
var(--tv-success)    /* Green #10b981 */
var(--tv-warning)    /* Yellow #f59e0b */
var(--tv-danger)     /* Red #ef4444 */

/* Grays */
var(--tv-gray-50)    /* Lightest */
var(--tv-gray-100)   /* Very light */
var(--tv-gray-500)   /* Medium */
var(--tv-gray-900)   /* Darkest */
```

### Typography
```css
var(--tv-text-xs)    /* Extra small */
var(--tv-text-sm)    /* Small */
var(--tv-text-base)  /* Normal */
var(--tv-text-lg)    /* Large */
var(--tv-text-xl)    /* Extra large */
var(--tv-text-2xl)   /* Huge */
```

### Effects
```css
var(--tv-shadow-sm)      /* Subtle */
var(--tv-shadow-md)      /* Medium */
var(--tv-shadow-lg)      /* Strong */

var(--tv-radius-sm)      /* Buttons, inputs */
var(--tv-radius-md)      /* Cards, sections */
var(--tv-radius-lg)      /* Modals */

var(--tv-transition)     /* 200ms ease-in-out */
```

## Common Patterns

### Form with Section Headers
```html
<div class="tvCard tvCard--compact">
  <form class="tvGrid">
    <!-- Section 1 -->
    <div class="tvCardSection">
      <h4 class="tvCardTitle">Client Information</h4>
      <div class="tvGrid">
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Name</label>
          <input class="tvInput" required>
        </div>
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Phone</label>
          <input type="tel" class="tvInput" required>
        </div>
      </div>
    </div>
    
    <!-- Section 2 -->
    <div class="tvCardSection">
      <h4 class="tvCardTitle">Vehicle Information</h4>
      <div class="tvGrid">
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Make/Model</label>
          <input class="tvInput" required>
        </div>
        <div class="tvField">
          <label class="tvLabel tvLabel--required">Registration</label>
          <input class="tvInput" required>
        </div>
      </div>
    </div>
    
    <!-- Submit Button -->
    <div style="grid-column: 1 / -1; display: flex; gap: var(--tv-space-2);">
      <button type="submit" class="tvBtn tvBtn--primary">
        <i class="fas fa-save"></i> Save
      </button>
      <button type="reset" class="tvBtn tvBtn--ghost">Reset</button>
    </div>
  </form>
</div>
```

### Action Button Group
```html
<div style="display: flex; gap: var(--tv-space-2);">
  <button class="tvBtn tvBtn--success">
    <i class="fas fa-check"></i> Approve
  </button>
  <button class="tvBtn tvBtn--danger">
    <i class="fas fa-trash"></i> Delete
  </button>
  <button class="tvBtn tvBtn--ghost">
    <i class="fas fa-times"></i> Close
  </button>
</div>
```

### Card Row in List
```html
<div class="tvCard">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <div>
      <h4>Item Title</h4>
      <p style="color: var(--tv-gray-500);">Subtitle info</p>
    </div>
    <div style="display: flex; gap: var(--tv-space-2);">
      <button class="tvBtn tvBtn--ghost">Edit</button>
      <button class="tvBtn tvBtn--danger">Delete</button>
    </div>
  </div>
</div>
```

## Responsive Tricks

### Hide on Mobile
```html
<div style="display: none;">
  <!-- Hidden on all screens -->
</div>

<div class="tvHide--mobile">
  <!-- Hidden on screens < 768px -->
</div>
```

### Show Only on Mobile
```html
<div class="tvShow--mobile">
  <!-- Visible only on screens < 768px -->
</div>
```

### Responsive Padding
```html
<div style="padding: var(--tv-space-4);">
  Automatically scales with viewport
</div>
```

### Responsive Gap
```html
<div style="display: flex; gap: var(--tv-space-2);">
  Items automatically adjust spacing
</div>
```

## Breakpoints

- **Mobile**: < 768px (vertical layout)
- **Desktop**: ≥ 768px (horizontal layout)

Uses `clamp()` for fluid scaling between breakpoints.

## Best Practices

1. ✅ Always use `.tvField` wrapper for form inputs
2. ✅ Always use `.tvLabel` for form labels
3. ✅ Always use `.tvBtn tvBtn--*` for buttons
4. ✅ Always use `.tvCard` for containers
5. ✅ Always use `.tvGrid` for layouts
6. ✅ Always use design tokens (CSS variables) for spacing/colors
7. ✅ Always use `.tvCardSection` to group related fields
8. ✅ Call `showToast()` for user feedback

## Common Mistakes to Avoid

1. ❌ Using hardcoded pixel values (use `var(--tv-space-*)`)
2. ❌ Mixing button styles (use only `.tvBtn` variants)
3. ❌ Different spacing patterns (use `var(--tv-space-*)`)
4. ❌ Form inputs without `.tvField` wrapper
5. ❌ Custom card styling (use `.tvCard` with modifiers)
6. ❌ Media queries (use responsive units instead)
7. ❌ Hardcoded colors (use `var(--tv-primary)` etc.)

## File Reference

- **Use components from**: `styles/design-system.css`
- **Component guide**: `DESIGN_SYSTEM_GUIDE.md`
- **Usage examples**: `QUICK_START.md`
- **Implementation details**: `DESIGN_SYSTEM_IMPLEMENTATION.md`

---

**Print this card and keep it handy!** 📋✨
