# Legacy Made — Email Style Guide

A quick reference for the backend when designing transactional and system emails.

---

## Tone & Feel

**Guiding words:** Calm, human, respectful, clear, unhurried.

Emails should feel like a thoughtful note from a trusted friend — not a corporate notification. Avoid urgency language ("Act now!", "Don't miss out!"), clinical/legal jargon, and anything that feels transactional or automated.

**Do:** "Here's what you need to know." / "Take your time with this."
**Don't:** "URGENT: Action required!" / "Your account needs immediate attention."

---

## Colors

### Primary Palette

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#F9F8F8` | Email body background |
| Surface / Card | `#FFFFFF` | Content cards, sections |
| Primary accent | `#8a9785` | Buttons, links, key highlights |
| Primary pressed | `#7d8a79` | Hover/active state for buttons |

### Text

| Role | Hex | Usage |
|------|-----|-------|
| Primary text | `#1A1A1A` | Headings, important content |
| Secondary text | `#6B6B6B` | Body copy, descriptions |
| Tertiary text | `#9B9B9B` | Captions, fine print |

### Feature Colors (use sparingly for context-specific emails)

| Feature | Color | Tint (background) | Dark (heading on tint) |
|---------|-------|--------------------|------------------------|
| Information Vault | `#8a9785` | `#EEF2EC` | `#3F4A3F` |
| Wishes & Guidance | `#B8A9C9` | `#F2EDF6` | `#5A4B6B` |
| Legacy Messages | `#A3C4D8` | `#ECF2F6` | `#3A4F5C` |
| Family Access | `#E0B8A8` | `#F8F0ED` | `#6B4A3F` |

### Semantic

| Role | Hex |
|------|-----|
| Success | `#4A7C59` |
| Warning | `#C17817` |
| Error | `#A63D40` |

### Borders & Dividers

| Role | Hex |
|------|-----|
| Border | `#E8E6E3` |
| Divider | `#F0EEEB` |

---

## Typography

### Fonts

- **Headings:** Libre Baskerville (serif) — warm, human, unhurried
- **Body / UI text:** DM Sans (sans-serif) — clean and legible

For email clients that don't support custom fonts, fall back to:
- Serif: `Georgia, 'Times New Roman', serif`
- Sans: `'Helvetica Neue', Helvetica, Arial, sans-serif`

### Sizing (for email)

| Element | Size | Weight |
|---------|------|--------|
| Email title / hero heading | 28–32px | Regular (serif) |
| Section heading | 20–24px | Regular (serif) |
| Body text | 16px | Regular (sans) |
| Secondary / supporting text | 14px | Regular (sans) |
| Fine print / captions | 12px | Regular (sans) |

### Line Height

- Headings: 1.2–1.3
- Body text: 1.5
- Relaxed / long-form: 1.7

---

## Layout Principles

- **Max width:** 600px (standard email width)
- **Generous whitespace:** 24–32px padding inside content areas; 16–24px between sections
- **Card-style sections:** White (`#FFFFFF`) rounded containers on the `#F9F8F8` background
- **Border radius:** 12–16px on cards and content blocks
- **Alignment:** Left-aligned text (never centered body copy)

---

## Buttons

- **Background:** `#8a9785` (sage green)
- **Text:** `#FFFFFF`, DM Sans, 16px, semibold (600)
- **Shape:** Pill / rounded (border-radius ~25px), height ~48–52px, horizontal padding ~32px
- **Hover/active:** `#7d8a79`
- **Secondary buttons:** White background, `#8a9785` border and text
- Keep button labels short and clear: "View Details", "Accept Invitation", "Get Started"

---

## Email Structure Template

```
┌─────────────────────────────────────┐
│         #F9F8F8 background          │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Logo / wordmark (centered)   │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  #FFFFFF card                 │  │
│  │                               │  │
│  │  Heading (serif)              │  │
│  │                               │  │
│  │  Body text (sans)             │  │
│  │  Keep it brief and warm.      │  │
│  │                               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │   Primary CTA Button    │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  Footer: fine print, unsubscribe    │
│  (#9B9B9B, 12px, centered)         │
│                                     │
└─────────────────────────────────────┘
```

---

## Do's and Don'ts

**Do:**
- Keep emails short — say what's needed, nothing more
- Use the serif font for headings to maintain warmth
- Leave plenty of breathing room between sections
- Write in a calm, supportive voice

**Don't:**
- Use bold colors, gradients, or heavy imagery
- Add multiple CTAs competing for attention
- Use all-caps for emphasis (use semibold weight instead)
- Include fear-based or urgency-driven language
