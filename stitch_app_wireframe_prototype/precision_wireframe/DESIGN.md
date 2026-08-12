---
name: Precision Wireframe
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434655'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  status-code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  headline-md-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  margin-mobile: 16px
  gutter-mobile: 12px
---

## Brand & Style
The design system is engineered for utility, clarity, and technical reliability. It serves as a high-fidelity wireframe foundation for an enterprise attendance application where accuracy is paramount. 

The aesthetic is **Corporate / Modern** with a focus on **Minimalism**. It prioritizes information density and legible data over decorative elements. The goal is to evoke a sense of "systematic trust"—the interface should feel like a professional tool that works flawlessly under technical constraints. Heavy use of whitespace, structured grids, and a strict monochromatic-with-accent approach ensures that users can perform critical actions (like geo-fenced clock-ins) without distraction.

**Design Principles:**
- **Clarity over Visuals:** Content hierarchy must be immediately obvious.
- **Utilitarian Efficiency:** Minimize the steps to complete primary tasks.
- **Technical Precision:** Use alignment and consistent spacing to reflect the app's geo-spatial and time-tracking accuracy.

## Colors
This design system utilizes a high-contrast, professional palette designed for readability in various lighting conditions (e.g., employees checking in outdoors).

- **Primary Blue:** A punchy, technical blue used exclusively for primary action buttons, active states, and critical status indicators (like "Within Radius").
- **Neutral Grays:** A range of Cool Grays (Slate) provides the structural framework. Light grays define surface areas and containers, while darker grays are reserved for secondary text and icons.
- **Background:** A crisp white background maintains high contrast for text.
- **Semantic Colors:** While not primary, Success (Green) and Error (Red) should be used sparingly for status validation (e.g., "Clock-in Successful" or "Outside Branch Radius").

## Typography
Typography is the primary driver of hierarchy. 

**Hanken Grotesk** is used for headlines to provide a sharp, contemporary feel that looks "engineered." 
**Inter** is the workhorse for all body copy and input text, chosen for its exceptional legibility on mobile screens and neutral character. 
**JetBrains Mono** is introduced for labels, timestamps, and GPS coordinates to reinforce the technical and data-driven nature of the project.

- Use **label-caps** for section headers (e.g., "CURRENT LOCATION") to create clear separation.
- Maintain strict vertical rhythm by adhering to the defined line heights.
- All numbers (time, coordinates, distances) should preferably use tabular figures or the monospaced font to prevent "jumping" during real-time updates.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for mobile devices. It utilizes an 8pt grid system to ensure consistent alignment.

- **Margins:** 16px safe area on left and right edges.
- **Vertical Rhythm:** Content blocks are separated by `lg` (24px) spacing, while related elements within a block (like an input and its label) use `xs` (8px).
- **Safe Areas:** Ensure interactive elements (buttons) are at least 48px in height to meet accessibility standards for mobile interaction.
- **Reflow:** On tablets, the layout transitions to a max-width container (640px) centered on the screen to prevent line lengths from becoming too long for comfortable reading.

## Elevation & Depth
In keeping with the utilitarian wireframe style, depth is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Base):** White background (#FFFFFF).
- **Level 1 (Cards/Containers):** Light gray background (#F8FAFC) with a subtle 1px border (#E2E8F0).
- **Active State:** Elements that are being interacted with or are "on" use a Primary Blue outline or a very soft, high-diffusion shadow (4px blur, 5% opacity) to indicate they are "raised" slightly above the surface.
- **Dividers:** Use 1px solid lines (#F1F5F9) to separate list items or grouped metadata.

## Shapes
The design system uses a **Soft (1)** roundedness profile. This provides a professional balance between the harshness of sharp corners and the "consumer" feel of pill shapes.

- **Standard Buttons & Inputs:** 4px (0.25rem) corner radius.
- **Cards & Large Containers:** 8px (0.5rem) corner radius.
- **Status Badges:** May use the larger 12px (0.75rem) radius to differentiate them from interactive elements.

## Components
- **Buttons:** Primary buttons are solid Primary Blue with white text. Secondary buttons are outlined in Slate-300 with Slate-700 text.
- **Input Fields:** Use a clean 1px border. Labels must always be visible (no floating labels that disappear). Use JetBrains Mono for placeholder text to hint at data entry.
- **Cards:** White surfaces with a subtle border. Used to group attendance history items or branch details.
- **Status Indicators:** Small circular dots or subtle background tints. Green for "In-Bounds," Red for "Out-of-Bounds."
- **Check-In Toggle:** A large, high-contrast action area at the bottom of the screen or centered, ensuring it is the most reachable element for one-handed use.
- **Lists:** Clean, horizontal rows with 16px padding. Use chevrons only if the row is navigable.