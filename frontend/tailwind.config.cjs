/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// THEME-AWARE COLOR SYSTEM
// Every color below resolves through a CSS variable defined per-theme in
// src/index.css. `rgb(var(--x) / <alpha-value>)` keeps Tailwind opacity
// modifiers (bg-surface/80, text-slate-500/60 …) fully functional.
// Switching [data-theme] on <html> re-skins the whole app — no page edits.
// ─────────────────────────────────────────────────────────────────────────────
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

const scale = (prefix, shades) =>
  Object.fromEntries(shades.map((s) => [s, v(`--${prefix}-${s}`)]));

module.exports = {
    darkMode: "class",
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // ── Neutrals + status families → CSS variables ─────────
                slate:   scale('sl',  [50,100,200,300,400,500,600,700,800,900,950]),
                red:     scale('red', [50,100,200,300,400,500,600,700,800]),
                emerald: scale('em',  [50,100,200,300,400,500,600,700,800]),
                amber:   scale('am',  [50,100,200,300,400,500,600,700,800]),
                blue:    scale('bl',  [50,100,200,300,400,500,600,700,800]),
                indigo:  { ...scale('in', [50,100,200,300,400,500,600,700,800]), 950: v('--in-950') },
                violet:  scale('vi',  [50,100,200,300,400,500,600,700,800]),
                green:   scale('gr',  [50,100,200,300,400,500,600,700,800]),
                orange:  scale('or',  [50,100,200,300,400,500,600,700,800]),

                // ── Semantic tokens ─────────────────────────────────────
                primary:          v('--c-primary'),
                "primary-dark":   v('--c-primary-dark'),
                "primary-light":  v('--c-primary-container'),
                "on-primary":     v('--c-on-primary'),

                // surfaces
                "background":               v('--c-bg'),
                "surface":                  v('--c-surface'),
                "surface-container":        v('--c-surface'),
                "surface-container-low":    v('--c-surface-low'),
                "surface-container-lowest": v('--c-surface'),
                "surface-container-high":   v('--c-surface-high'),
                "surface-container-highest":v('--c-surface-high'),
                "surface-variant":          v('--c-surface-high'),
                "surface-dim":              v('--c-surface-low'),
                "surface-bright":           v('--c-surface'),

                // text / on-surfaces
                "on-background":            v('--sl-900'),
                "on-surface":               v('--sl-800'),
                "on-surface-variant":       v('--sl-500'),
                "on-primary-container":     v('--c-on-primary-container'),
                "on-secondary":             v('--sl-800'),
                "on-secondary-container":   v('--sl-800'),
                "on-tertiary":              v('--sl-800'),
                "on-tertiary-container":    v('--sl-800'),
                "on-error":                 "#ffffff",
                "on-error-container":       v('--red-800'),

                // outline / borders
                "outline":                  v('--sl-200'),
                "outline-variant":          v('--sl-200'),

                // status / containers
                "secondary":          v('--sl-500'),
                "tertiary":           v('--vi-400'),
                "tertiary-container": v('--vi-100'),
                "primary-container":  v('--c-primary-container'),
                "secondary-container":v('--sl-100'),
                "error":              v('--red-500'),
                "error-container":    v('--red-100'),
                "inverse-surface":    v('--sl-800'),
                "inverse-on-surface": v('--sl-100'),
                "inverse-primary":    v('--in-300'),
                "surface-tint":       v('--c-primary'),
            },
            fontFamily: {
                // @fontsource-variable installs as 'Space Grotesk Variable' (variable font)
                "headline": ["'Space Grotesk Variable'", "'Space Grotesk'", "sans-serif"],
                "body":     ["'Space Grotesk Variable'", "'Space Grotesk'", "sans-serif"],
                "label":    ["'Space Grotesk Variable'", "'Space Grotesk'", "sans-serif"],
            },
            borderRadius: {"DEFAULT": "0.5rem", "lg": "0.75rem", "xl": "1rem", "2xl": "1.25rem", "full": "9999px"},
            boxShadow: {
                'soft':  'var(--shadow-soft)',
                'card':  'var(--shadow-card)',
                'pop':   'var(--shadow-pop)',
                'glow':  'var(--shadow-glow)',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ],
}
