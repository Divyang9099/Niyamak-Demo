# Varuna Ops — Design System & Theme Architecture

> Single source of truth for UI decisions. Business logic, APIs, RBAC and
> workflows are **never** affected by anything in this document.

## 1. Architecture — how theming works

Every color in the application resolves through a CSS variable:

```
page JSX  →  Tailwind class (bg-surface, text-slate-500, bg-red-50 …)
          →  tailwind.config.cjs maps it to rgb(var(--…) / <alpha-value>)
          →  src/index.css defines the variable per [data-theme] block
```

Switching `data-theme` on `<html>` re-skins the **entire app** — sidebar,
cards, tables, buttons, forms, charts, calendar, scrollbars, map popups —
with **zero page edits**. Opacity modifiers (`bg-surface/80`) keep working
because variables are raw RGB triplets.

- **Persistence**: `localStorage('varuna_theme')` — applied **pre-paint** by an
  inline script in `index.html` (no flash of wrong theme), then managed by
  `src/context/ThemeContext.jsx`.
- **Switching**: instant, no refresh; a brief `html.theme-transition` class
  cross-fades colors (250 ms).
- **UI**: Profile → Theme (`src/pages/profile/ThemeSettings.jsx`), five theme
  cards with live mini-previews.

## 2. The five themes

| id        | Name            | Surfaces            | Accent            | Mode  |
|-----------|-----------------|---------------------|-------------------|-------|
| `obsidian`| Obsidian Prime  | graphite `#121317`  | violet `#8b5cf6`  | dark (default) |
| `light`   | Corporate Light | white / `#f5f6fa`   | blue `#2563eb`    | light |
| `midnight`| Midnight Ops    | blue-black `#070b14`| cyan `#22d3ee`    | dark  |
| `forest`  | Forest Command  | green-black `#0a100c`| emerald `#34d399`| dark  |
| `solar`   | Solar Vision    | warm white `#faf7f0`| orange `#ea580c`  | light |

### Shade contract (critical when adding UI)

| Shade   | Light themes      | Dark themes                                  |
|---------|-------------------|----------------------------------------------|
| 50–300  | tinted fills/borders | **dark** tinted fills/borders (auto-flipped) |
| 400–500 | accents           | unchanged                                    |
| 600     | strong solid/text | solid mid-tone — safe under `text-white`     |
| 700–800 | dark text         | **luminous** text (chip text, emphasis)      |
| slate scale | neutrals      | **inverted** (slate-50 = darkest fill, slate-900 = lightest text) |

## 3. Token reference

- **Surfaces**: `bg-background` (app), `bg-surface` (cards/panels),
  `bg-surface-container-low|high` (subtle tiers). **Never use `bg-white`** —
  use `bg-surface`.
- **Text**: `text-slate-900` headings · `text-slate-700` body ·
  `text-slate-500` secondary · `text-slate-400` muted/captions.
- **Borders**: `border-slate-200` (or `border-outline`).
- **Accent**: `bg-primary` + `text-on-primary` (NOT `text-white` — cyan/emerald
  accents use dark text), `hover:bg-primary-dark`, `bg-primary-light` container.
- **Status**: Badge variants — success `emerald`, warning `amber`,
  danger `red`, info `blue`. Chips: `bg-{c}-50 text-{c}-700 border-{c}-200`.
- **Elevation**: `shadow-soft` (subtle) · `shadow-card` (cards) ·
  `shadow-pop` (overlays) · `shadow-glow` (accent CTAs). All theme-aware.
- **Charts**: series colors stay vivid hexes (data colors); chart *chrome*
  (grid/axis/ticks/tooltips) is themed globally in `index.css` — don't hardcode
  light-gray hexes in new charts; `var(--chart-1..6)` available per theme.

## 4. Component standards

- **Buttons** (`ui/Button.jsx`): variants `primary | secondary | danger |
  ghost | text`; sizes `sm/md/lg/xl`; built-in spinner via `isLoading`;
  icon-only buttons auto-derive `aria-label`.
- **Typography**: Space Grotesk Variable everywhere. Page title ~`text-xl
  font-bold`, section `text-base font-bold`, body `text-sm`,
  caption `text-xs text-slate-400`, overline `text-[10px]/text-xs font-bold
  uppercase tracking-widest`.
- **Radius**: inputs/buttons `rounded-xl`, cards/modals `rounded-2xl`,
  chips `rounded-full`. **Spacing**: 4-px scale; card padding `p-5/p-6`.
- **Icons**: Material Symbols only; nav 22px, buttons `text-sm`–`text-base`,
  `FILL 1` to signal active state.
- **Motion**: `animate-fade-in` (overlays), `animate-scale-in` (modals),
  `animate-slide-up` (panels), `.skeleton-shimmer` (loading). All respect
  `prefers-reduced-motion`. Keep durations ≤ 300 ms.
- **A11y**: global `:focus-visible` ring (theme accent); modals are
  `role="dialog" aria-modal`; toggles are `role="switch"`; theme picker is a
  `radiogroup`.

## 5. Rules for new code

1. Never hardcode hex colors in JSX — use Tailwind classes (themed) or
   `var(--…)` in inline styles.
2. Never `bg-white` / `text-black` — `bg-surface` / `text-slate-900`.
3. White text on accent = `text-on-primary`, never `text-white`.
4. Solid color buttons: use the 500/600 shade families (`bg-emerald-600
   text-white` is safe — 600 stays solid in dark themes by contract).
5. New themes: add a `[data-theme='…']` block in `index.css`, an entry in
   `THEMES` (ThemeContext) and the valid-list in `index.html`'s pre-paint
   script.
