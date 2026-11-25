---
name: Time Bank Admin
description: Compact staff tools for municipal Time Bank operations.
colors:
  indigo: "#5c54d8"
  indigo-hover: "#4b43bc"
  indigo-link: "#4b44be"
  indigo-tint: "#f1f0ff"
  series-blue: "#386db7"
  series-green: "#22805c"
  slate: "#f5f6fa"
  white: "#ffffff"
  subtle-slate: "#f9f9fc"
  hover-slate: "#f0f0f7"
  slate-line: "#e4e6ef"
  ink: "#171a27"
  slate-copy: "#62677a"
  slate-nav: "#494e61"
  green: "#237453"
  green-tint: "#ebf7ef"
  amber: "#875000"
  amber-tint: "#fff4df"
  red: "#a53442"
  red-tint: "#fdecf0"
  dark-slate: "#25293c"
  dark-nav: "#303347"
  dark-panel: "#2e3247"
  dark-line: "#44485e"
  dark-ink: "#f5f6fa"
  dark-copy: "#a9aec0"
  dark-link: "#c2bdff"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(29px, 3.4vw, 41px)"
    lineHeight: 1.1
    letterSpacing: "-.05em"
  headline:
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  title:
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: "13px"
    fontWeight: 600
  badge:
    fontSize: "0.72rem"
    fontWeight: 650
    lineHeight: 1.25
rounded:
  navigation: "9px"
  panel: "12px"
  pill: "999px"
  sign-in: "25px"
spacing:
  card-gap: "12px"
  card-inset: "16px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 18px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-hover}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-copy}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 18px"
  input:
    backgroundColor: "{colors.subtle-slate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 14px"
  nav-item:
    textColor: "{colors.slate-nav}"
    rounded: "{rounded.navigation}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.white}"
  status-approved:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.green}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  overview-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.card-inset}"
---

# Design System for Time Bank Admin

## Overview

**Creative North Star** “Municipal workbench”

The Time Bank web dashboard is compact and direct. A persistent navigation rail and unified toolbar establish where staff are working, with the available actions and records in the main pane.

Light and dark themes use slate surfaces and an indigo accent. Borders define everyday panels, while a stronger shadow separates floating controls from the content beneath them.

- Compact, labeled controls with visible active and focus states.
- Bordered panels and neutral tables with semantic status badges.
- Shared indigo actions and theme-aware slate surfaces.

This document covers the Next.js dashboard and staff sign-in. The scoped light and dark theme variables in [admin-overview.css](apps/web/src/app/admin-overview.css) take precedence over the base styles in [globals.css](apps/web/src/app/globals.css). [admin-sign-in.css](apps/web/src/app/admin-sign-in.css) defines sign-in-specific treatments.

## Colors

**Primary.** Indigo fills primary actions and the active navigation row. Deep indigo marks hover, pale indigo supports selected surfaces, and light indigo carries link and focus treatments in dark mode.

**Secondary.** Blue and green distinguish chart series alongside indigo. Their dark-theme variants are defined with the chart tokens in the admin stylesheet.

**Status.** Green identifies positive states, amber marks pending or warning states, and red marks errors and restrictions. Each has a matching tinted surface and a text label.

**Neutrals.** Page slate sits behind white panels in light mode. In dark mode, darker page slate sits behind lighter slate navigation and panels. Theme-specific ink, muted copy, and divider colors follow the surface.

## Typography

Inter is the base typeface, with system sans fallbacks. Page headings are 28px at weight 700. Overview section headings are 16px at weight 600. Base text is 14px with a 1.5 line height, and overview card labels are 13px at weight 600. Supporting metadata uses 12px. KPI values use tabular numerals and scale from 24px to 34px. The sign-in heading has its own responsive size.

## Layout

- The desktop sidebar is 248px wide. The main content is capped at 1520px with horizontal padding from 16px to 36px.
- Overview sections are 24px apart. Card grids use 12px gaps and cards have 16px padding. The KPI grid drops from five columns to three at 1279px and to two at 540px.
- At 900px and below, the sidebar becomes full-width with a menu control. At 540px and below, search takes the full first row of the toolbar and actions wrap beneath it.
- The sign-in card splits form and introduction on desktop. At 740px and below, it uses a single column and hides the introduction.

## Elevation & Depth

Overview cards and the sidebar are flat and defined by a one-pixel border. Standard panels use a small shadow. Floating controls use the theme-specific popover shadow, and sign-in has a broader card shadow.

## Shapes

Panel corners use a 12px radius and navigation rows use 9px. Shared buttons, inputs, and status badges use pill shapes. Sign-in has a dedicated 25px outer card radius.

## Components

**Buttons.** The shared dashboard button is 38px high. Primary actions use white text on indigo. Secondary actions use a panel fill and border, with a quieter surface change on hover. The dashboard uses a visible two-pixel focus outline for buttons.

**Inputs.** Standard fields have a subtle fill and border. Focus changes the border and adds a three-pixel ring. Sign-in fields use a 46px minimum height and 16px type on narrow screens.

**Navigation.** A row combines an icon with a text label. Hover uses a neutral tint. The current section uses a filled indigo row with white ink. The toolbar groups search, organization scope, and account and utility actions.

**Status badges.** Small tinted pills pair a semantic color with a named status. Keep the label visible at compact widths.

**Overview cards.** KPI, review, activity, and analytics panels share borders, corner radius, and padding. KPI cards add a faint accent tied to their metric. Interactive cards change their background and border on hover.

## Do's and Don'ts

- Do use the scoped admin theme variables for new dashboard UI.
- Do use status words alongside their semantic colors.
- Do retain keyboard focus indicators and the compact layout at narrow widths.
- Don't use chart-series colors as general action accents.
- Don't apply the popover shadow to overview cards.
