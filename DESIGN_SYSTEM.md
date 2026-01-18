# Design System Documentation

## Color Palette

### Primary Brand Color (Rusty Orange)
- **Primary**: `#FF8A3D` - Used for key actions, highlights, and CTAs
- **Primary Dark**: `#F47C2C` - Hover states and emphasis
- **Primary Gradient**: `linear-gradient(90deg, #FF8A3D, #FFA868)` - Primary buttons

### Backgrounds
- **Warm Background**: `#FFF7F1` - Main page background
- **Section Surface**: `#FDEEE3` - Secondary surfaces and highlights
- **Card Background**: `#FFFFFF` - Cards and elevated surfaces

### Typography
- **Text Primary**: `#1F1F1F` - Main headings and body text
- **Text Secondary**: `#8A7F78` - Secondary information, captions

### Borders & Shadows
- **Border Subtle**: `rgba(0, 0, 0, 0.08)` - Soft borders
- **Shadow Soft**: `0 8px 30px rgba(0, 0, 0, 0.08)` - Card shadows
- **Shadow Hover**: `0 12px 40px rgba(0, 0, 0, 0.12)` - Hover elevation
- **Shadow Button**: `0 4px 16px rgba(255, 138, 61, 0.25)` - Primary button shadow

### Accent Colors (Micro-accents only)
- **Success Mint**: `#2ECC9A` - Success states, posted items
- **Warning Amber**: `#FFA500` - Pending states
- **Danger Red**: `#EF4444` - Delete actions, errors

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

### Font Weights
- **Regular**: 400 - Body text
- **Semi-Bold**: 600 - Headings, labels, buttons

### Sizes
- **H1**: 2.25rem (36px) - Main page title
- **H2**: 1.5rem (24px) - Section headings
- **Body**: 1rem (16px) - Standard text
- **Small**: 0.875rem (14px) - Captions, labels
- **Tiny**: 0.8125rem (13px) - Secondary info

### Line Height
- Increased to 1.6 for better readability
- Headings: 1.3

## Spacing (8px Grid)

```css
--space-1: 8px
--space-2: 16px
--space-3: 24px
--space-4: 32px
--space-5: 40px
--space-6: 48px
```

## Components

### Buttons

#### Primary Button
- Background: Rusty orange gradient
- Padding: 14px 32px
- Border-radius: 12px
- Font-weight: 600
- Hover: translateY(-1px) + enhanced shadow
- Focus: 2px outline with offset

#### Action Buttons
- **Success** (Post): Mint green background
- **Warning** (Unpost): Amber background
- **Danger** (Delete): Red background
- **Primary** (Visit): Rusty orange background

### Cards

#### Page Cards
- Background: Warm cream (#FDEEE3 for pending, gradient for posted/delete)
- Border: 1.5px subtle border
- Border-radius: 14px
- Padding: 24px
- Hover: translateY(-2px) + shadow elevation

#### Stat Cards
- Background: White
- Border: 1px subtle
- Border-radius: 16px
- Padding: 32px
- Hover: translateY(-2px) + shadow

### Live Status Strip

- Pulsing indicators (green for active, orange for pending)
- Soft background with warm tones
- Human-friendly messaging
- Real-time timestamp updates

## Animations

### Timing Functions
- **Standard**: `cubic-bezier(0.4, 0, 0.2, 1)` - Most transitions
- **Ease-in-out**: For heartbeat and pulse effects

### Durations
- **Quick**: 0.2s - Hover states
- **Standard**: 0.25s - Card transitions
- **Slow**: 0.4s - Count-up animations
- **Pulse**: 2s - Status indicators

### Motion Effects
1. **Hover**: translateY(-1px to -2px) + shadow
2. **Count-up**: Scale pulse on number change
3. **Heartbeat**: Subtle scale animation on icons
4. **Fade-in**: Cards entering view
5. **Pulse**: Status indicator breathing effect

### Accessibility
- `@media (prefers-reduced-motion: reduce)` support included
- All animations reduced to near-instant for users who prefer less motion

## Accessibility Features

1. **Focus States**: All interactive elements have visible focus outlines
2. **Color Contrast**: All text meets WCAG AA standards
3. **Keyboard Navigation**: Full keyboard support
4. **Aria Labels**: Icon buttons include appropriate labels
5. **Motion**: Respects prefers-reduced-motion

## Usage Guidelines

### DO:
✅ Use rusty orange (#FF8A3D) for primary actions and key highlights
✅ Keep backgrounds warm and bright (#FFF7F1, #FDEEE3)
✅ Add subtle hover states with micro-motion
✅ Use mint green for success states only
✅ Maintain 8px grid spacing
✅ Use semi-bold (600) for headings, regular (400) for body

### DON'T:
❌ Use rusty orange for large background areas
❌ Mix multiple bright accent colors
❌ Add excessive animations or motion
❌ Use harsh shadows or dark backgrounds
❌ Ignore focus states for accessibility
❌ Break the 8px spacing grid

## Live Features

1. **Activity Strip**: Real-time status updates
2. **Count-up Numbers**: Animated statistics
3. **Pulsing Indicators**: Live status dots
4. **Human Messages**: Context-aware microcopy
5. **Mini-previews**: Last post information

## Romanian UI Language

All user-facing text is in Romanian, maintaining a warm and professional tone:
- "Postat cu succes" (Posted successfully)
- "În așteptare" (Waiting)
- "Necesită atenția ta" (Needs your attention)
- "Totul este pregătit pentru astăzi" (Everything is ready for today)
