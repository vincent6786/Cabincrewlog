// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                         CREWLOG  v2.0  —  App.jsx  (EVA Air Edition)      ║
// ║              我的天空日記  ·  Your Private Cabin Crew Companion             ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Stack : React 18 (hooks) · Firebase Firestore · Inline styles             ║
// ║  Auth  : Passcode gate + localStorage username (no Firebase Auth)           ║
// ║  Sync  : Shared crew/routes via "crewlog/shared"; private flights per user ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { useState, useEffect, useRef, useCallback } from "react";
import { db }                                        from "./firebase";
import { doc, onSnapshot, setDoc, getDoc }            from "firebase/firestore";
import { INITIAL_CREW }                              from "./crewData";


// ─────────────────────────────────────────────────────────────────────────────
// §1  CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** Shared passcode — layer 1 gate for all users. */
const APP_PASSCODE = "crew2026";

/**
 * EmailJS configuration for password-reset OTP emails.
 * Set these up at https://www.emailjs.com (free tier is fine).
 * - EMAILJS_SERVICE_ID  : your Email Service ID (e.g. "service_xxxxxx")
 * - EMAILJS_TEMPLATE_ID : your Email Template ID (e.g. "template_xxxxxx")
 *   Template variables available: {{to_email}}, {{username}}, {{otp_code}}
 * - EMAILJS_PUBLIC_KEY  : your Public Key (Account → API Keys)
 */
const EMAILJS_SERVICE_ID  = "service_cx54lij";
const EMAILJS_TEMPLATE_ID = "template_4e8s9wq";
const EMAILJS_PUBLIC_KEY  = "XRDslti28iokgIXKD";

/** OTP expiry in milliseconds (15 minutes). */
const OTP_EXPIRY_MS = 15 * 60 * 1000;

/** Built-in tags (shown for all users, cannot be deleted). */
const PRESET_TAGS = [
  "#Standard & SOP",
  // "#好笑", "#專業", "#八卦", "#準時",
];

/** Selectable aircraft types. */
const AIRCRAFT = ["B777", "B787", "A321", "A330"];

/** Selectable cabin positions. */
const POSITIONS = ["CP", "DP", "AP", "CA", "TA"];

/**
 * Status light definitions.
 * Each key maps to display emoji, human-readable label, and CSS colour tokens.
 */
const STATUS_MAP = {
  red:    { emoji: "🔴", label: "注意 / Warning", color: "#FF453A", bg: "rgba(255,69,58,0.13)",  border: "rgba(255,69,58,0.45)"  },
  yellow: { emoji: "🟡", label: "普通 / Neutral",  color: "#FFD60A", bg: "rgba(255,214,10,0.13)", border: "rgba(255,214,10,0.45)" },
  green:  { emoji: "🟢", label: "推薦 / Great!",   color: "#30D158", bg: "rgba(48,209,88,0.13)",  border: "rgba(48,209,88,0.45)"  },
};


// ─────────────────────────────────────────────────────────────────────────────
// §2  UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Generates a short collision-resistant ID (timestamp base-36 + 4 random chars). */
const mkId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Returns today's date as an ISO string (YYYY-MM-DD). */
const today = () => new Date().toISOString().slice(0, 10);


// ─────────────────────────────────────────────────────────────────────────────
// §3  THEME PALETTES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// §3  THEME SYSTEM — 5 themes × 2 modes = 10 palettes
// Each theme object contains all colour tokens used throughout the app.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THEMES map — key → palette object.
 * token reference:
 *   bg       : page background
 *   card     : card surface
 *   cardAlt  : inset / alternate surface
 *   border   : divider / border colour
 *   text     : primary text
 *   sub      : secondary / muted text
 *   accent   : CTA / highlight colour
 *   adk      : text ON accent (light dark contrast)
 *   pill     : inactive pill / badge background
 *   input    : input field background
 *   header   : top nav / header accent stripe
 */
const THEMES = {

  // ── 1a. The Boarding Look — Light ─────────────────────────────────────────
  "eva1Light": {
    bg:      "#FFFFFF",
    card:    "#F5F5F5",
    cardAlt: "#EBEBEB",
    border:  "#E0E0E0",
    text:    "#2D2D2D",
    sub:     "#7A7A7A",
    accent:  "#EA5400",   // Persimmon Orange CTA
    adk:     "#FFFFFF",
    pill:    "#EDEDED",
    input:   "#F5F5F5",
    header:  "#009A42",   // Evergreen Green
  },

  // ── 1b. The Night Flight — Dark ───────────────────────────────────────────
  "eva1Dark": {
    bg:      "#0B1A14",
    card:    "#162C23",
    cardAlt: "#1E3A2F",
    border:  "#2A4035",
    text:    "#E0E0E0",
    sub:     "#6B9080",
    accent:  "#FF7324",   // Brighter orange for dark visibility
    adk:     "#0B1A14",
    pill:    "#162C23",
    input:   "#162C23",
    header:  "#009A42",
  },

  // ── 2a. Shiatzy Chen — Professional Duty Light ───────────────────────────
  "eva2Light": {
    bg:      "#F4F7F6",
    card:    "#FFFFFF",
    cardAlt: "#EAF0EE",
    border:  "#D1D1D1",
    text:    "#1A1A1A",
    sub:     "#6B7B74",
    accent:  "#D30E24",   // Chief Purser Red
    adk:     "#FFFFFF",
    pill:    "#E5ECEB",
    input:   "#FFFFFF",
    header:  "#074736",   // Tourmaline Green
  },

  // ── 2b. Shiatzy Chen — Rest Period Dark ───────────────────────────────────
  "eva2Dark": {
    bg:      "#121212",
    card:    "#1E1E1E",
    cardAlt: "#252525",
    border:  "#333333",
    text:    "#B0BEC5",
    sub:     "#7A8B92",
    accent:  "#FF4D4D",   // High-visibility red
    adk:     "#121212",
    pill:    "#1E1E1E",
    input:   "#1E1E1E",
    header:  "#0A5C46",   // Vibrant Tourmaline
  },

  // ── 3a. Royal Laurel — The Suite Light ───────────────────────────────────
  "eva3Light": {
    bg:      "#FAF9F6",
    card:    "#FFFFFF",
    cardAlt: "#F5F3EE",
    border:  "#E8E4DC",
    text:    "#4B433B",
    sub:     "#7E746D",
    accent:  "#C5A059",   // Soft Gold
    adk:     "#FAF9F6",
    pill:    "#EDE9E0",
    input:   "#F5F3EE",
    header:  "#4B433B",   // Ebony Wood
  },

  // ── 3b. Royal Laurel — Dimmed Cabin Dark ─────────────────────────────────
  "eva3Dark": {
    bg:      "#1C1917",
    card:    "#292524",
    cardAlt: "#322E2B",
    border:  "#433E3A",
    text:    "#E7E5E4",
    sub:     "#A09590",
    accent:  "#D4AF37",   // Metallic Gold
    adk:     "#1C1917",
    pill:    "#292524",
    input:   "#292524",
    header:  "#4B433B",
  },

  // ── 4a. Sky Scarf — The Horizon Light ────────────────────────────────────
  "eva4Light": {
    bg:      "#FFFFFF",
    card:    "#F7FFFE",
    cardAlt: "#EFF9F7",
    border:  "#C8EAE2",
    text:    "#1A2B24",
    sub:     "#5A7A70",
    accent:  "#009A42",   // Evergreen (primary scarf colour)
    adk:     "#FFFFFF",
    pill:    "#E5F5EF",
    input:   "#F7FFFE",
    header:  "#009A42",
    accent2: "#F34820",   // Sunrise Orange (secondary — used for badges)
    accent3: "#87CEEB",   // Sky Blue (tertiary)
  },

  // ── 4b. Sky Scarf — The Stratosphere Dark ────────────────────────────────
  "eva4Dark": {
    bg:      "#0A192F",
    card:    "#0D2137",
    cardAlt: "#112843",
    border:  "#1A3A55",
    text:    "#FFFFFF",
    sub:     "#6B90A8",
    accent:  "#4FC3F7",   // Electric Sky Blue
    adk:     "#0A192F",
    pill:    "#0D2137",
    input:   "#0D2137",
    header:  "#004D40",   // Dark Teal
  },

  // ── 5a. Technical Log — The Clipboard Light ──────────────────────────────
  "eva5Light": {
    bg:      "#EBEBEB",
    card:    "#FFFFFF",
    cardAlt: "#F5F5F5",
    border:  "#D0D0D0",
    text:    "#1A1A1A",
    sub:     "#666666",
    accent:  "#004B36",   // Industrial Green
    adk:     "#FFFFFF",
    pill:    "#E0E0E0",
    input:   "#FFFFFF",
    header:  "#004B36",
  },

  // ── 5b. Technical Log — The Cockpit Dark ─────────────────────────────────
  "eva5Dark": {
    bg:      "#000000",
    card:    "#111111",
    cardAlt: "#1A1A1A",
    border:  "#333333",
    text:    "#00E676",   // Phosphor Green
    sub:     "#00A854",
    accent:  "#00E676",
    adk:     "#000000",
    pill:    "#111111",
    input:   "#111111",
    header:  "#00695C",   // Muted Teal Green
  },

  // ── 6a. Olive Garden Feast — Light ───────────────────────────────────────
  "oliveLight": {
    bg:      "#FEFAE0",    // Cornsilk - warm cream background
    card:    "#FFFFFF",
    cardAlt: "#F5F2E3",
    border:  "#DDA15E",    // Light Caramel border
    text:    "#283618",    // Black Forest text
    sub:     "#606C38",    // Olive Leaf subtitle
    accent:  "#BC6C25",    // Copper accent
    adk:     "#FEFAE0",
    pill:    "#F5F2E3",
    input:   "#FFFFFF",
    header:  "#606C38",    // Olive Leaf header
  },

  // ── 6b. Olive Garden Feast — Dark ────────────────────────────────────────
  "oliveDark": {
    bg:      "#283618",    // Black Forest background
    card:    "#3A4A24",
    cardAlt: "#4A5C2F",
    border:  "#606C38",    // Olive Leaf border
    text:    "#FEFAE0",    // Cornsilk text
    sub:     "#A3B18A",    // Muted sage
    accent:  "#DDA15E",    // Light Caramel accent
    adk:     "#283618",
    pill:    "#3A4A24",
    input:   "#3A4A24",
    header:  "#BC6C25",    // Copper header
  },

  // ── 8a. Pastel Dreamland — Whimsical Light ───────────────────────────────
  "pastelLight": {
    bg:      "#F9F5FF",    // Soft lavender white
    card:    "#FFFFFF",
    cardAlt: "#F3ECFF",
    border:  "#E0B1CB",    // Pink Orchid border
    text:    "#2D2033",    // Deep text
    sub:     "#7B6B8C",    // Muted purple
    accent:  "#C0B4DB",    // Pink Orchid
    adk:     "#FFFFFF",
    pill:    "#F3ECFF",
    input:   "#FFFFFF",
    header:  "#9F86C0",    // Lilac header
  },

  // ── 8b. Pastel Dreamland — Dream Dark ────────────────────────────────────
  "pastelDark": {
    bg:      "#1A1526",    // Deep purple night
    card:    "#2A2236",
    cardAlt: "#342B43",
    border:  "#4A3E5A",
    text:    "#E8DEFF",    // Soft lavender text
    sub:     "#9F86C0",    // Lilac
    accent:  "#BDE0FE",    // Icy Blue
    adk:     "#1A1526",
    pill:    "#2A2236",
    input:   "#2A2236",
    header:  "#7B68A6",    // Dusty purple
  },

  // ── 9a. Bold Berry — Vibrant Light ───────────────────────────────────────
  "berryLight": {
    bg:      "#FFF8F3",    // Soft Apricot cream
    card:    "#FFFFFF",
    cardAlt: "#FFF0E5",
    border:  "#FFA5AB",    // Cotton Candy border
    text:    "#1A0B0B",
    sub:     "#8B5A6B",    // Muted rose
    accent:  "#A53860",    // Cherry Rose
    adk:     "#FFFFFF",
    pill:    "#FFF0E5",
    input:   "#FFFFFF",
    header:  "#DA627D",    // Blush Rose
  },

  // ── 9b. Bold Berry — Deep Dark ───────────────────────────────────────────
  "berryDark": {
    bg:      "#1A0B0D",    // Deep crimson night
    card:    "#2A161A",
    cardAlt: "#3A1F24",
    border:  "#4A2830",
    text:    "#FFE0E7",    // Soft pink text
    sub:     "#C8909C",    // Rose gray
    accent:  "#FFA5AB",    // Cotton Candy
    adk:     "#1A0B0D",
    pill:    "#2A161A",
    input:   "#2A161A",
    header:  "#A53860",    // Cherry Rose
  },

  // ── 10a. Purple Dream — Majestic Light ───────────────────────────────────
  "purpleLight": {
    bg:      "#F5F3FF",    // Whisper lavender
    card:    "#FFFFFF",
    cardAlt: "#EBE5FF",
    border:  "#BE95C4",    // Lilac border
    text:    "#231942",    // Dark Amethyst text
    sub:     "#5E548E",    // Dusty Grape
    accent:  "#9F86C0",    // Amethyst Smoke
    adk:     "#FFFFFF",
    pill:    "#EBE5FF",
    input:   "#FFFFFF",
    header:  "#5E548E",    // Dusty Grape header
  },

  // ── 10b. Purple Dream — Moody Dark ───────────────────────────────────────
  "purpleDark": {
    bg:      "#0F0A1E",    // Deep violet night
    card:    "#1A132E",
    cardAlt: "#251C3E",
    border:  "#3A2E52",
    text:    "#E8DEFF",    // Soft lavender text
    sub:     "#9F86C0",    // Amethyst Smoke
    accent:  "#BE95C4",    // Lilac
    adk:     "#0F0A1E",
    pill:    "#1A132E",
    input:   "#1A132E",
    header:  "#5E548E",    // Dusty Grape
  },

  // ── 7a. Earthy Forest Hues — Light ───────────────────────────────────────
  "forestLight": {
    bg:      "#FFFFFF",
    card:    "#DAD7CD",    // Dust Grey cards
    cardAlt: "#C8C5BA",
    border:  "#A3B18A",    // Dry Sage border
    text:    "#344E41",    // Pine Teal text
    sub:     "#588157",    // Fern subtitle
    accent:  "#3A5A40",    // Hunter Green accent
    adk:     "#FFFFFF",
    pill:    "#E8E6DC",
    input:   "#DAD7CD",
    header:  "#3A5A40",    // Hunter Green header
  },

  // ── 7b. Earthy Forest Hues — Dark ────────────────────────────────────────
  "forestDark": {
    bg:      "#1A2820",    // Deep forest background
    card:    "#344E41",    // Pine Teal cards
    cardAlt: "#3A5A40",    // Hunter Green alternate
    border:  "#588157",    // Fern border
    text:    "#DAD7CD",    // Dust Grey text
    sub:     "#A3B18A",    // Dry Sage subtitle
    accent:  "#A3B18A",    // Dry Sage accent
    adk:     "#1A2820",
    pill:    "#2A3D32",
    input:   "#344E41",
    header:  "#588157",    // Fern header
  },

  // ── 8a. Black & Gold Elegance — Light ────────────────────────────────────
  "eleganceLight": {
    bg:      "#FFFFFF",
    card:    "#E5E5E5",    // Alabaster Grey cards
    cardAlt: "#D8D8D8",
    border:  "#C0C0C0",
    text:    "#14213D",    // Prussian Blue text
    sub:     "#5A6A8A",    // Muted Prussian
    accent:  "#FCA311",    // Orange accent
    adk:     "#000000",
    pill:    "#F0F0F0",
    input:   "#E5E5E5",
    header:  "#14213D",    // Prussian Blue header
  },

  // ── 8b. Black & Gold Elegance — Dark ─────────────────────────────────────
  "eleganceDark": {
    bg:      "#000000",
    card:    "#14213D",    // Prussian Blue cards
    cardAlt: "#1B2A4A",
    border:  "#2A3A5A",
    text:    "#FFFFFF",
    sub:     "#B8C0D0",
    accent:  "#FCA311",    // Orange accent
    adk:     "#000000",
    pill:    "#0D1827",
    input:   "#14213D",
    header:  "#FCA311",    // Orange header
  },

  // ── 9a. Deep Sea — Light ──────────────────────────────────────────────────
  "deepSeaLight": {
    bg:      "#FFFFFF",
    card:    "#E0E1DD",    // Alabaster Grey cards
    cardAlt: "#D0D1CD",
    border:  "#778DA9",    // Lavender Grey border
    text:    "#0D1B2A",    // Ink Black text
    sub:     "#415A77",    // Dusk Blue subtitle
    accent:  "#1B263B",    // Prussian Blue accent
    adk:     "#FFFFFF",
    pill:    "#ECECEA",
    input:   "#E0E1DD",
    header:  "#1B263B",    // Prussian Blue header
  },

  // ── 9b. Deep Sea — Dark ───────────────────────────────────────────────────
  "deepSeaDark": {
    bg:      "#0D1B2A",    // Ink Black background
    card:    "#1B263B",    // Prussian Blue cards
    cardAlt: "#273447",
    border:  "#415A77",    // Dusk Blue border
    text:    "#E0E1DD",    // Alabaster Grey text
    sub:     "#778DA9",    // Lavender Grey subtitle
    accent:  "#778DA9",    // Lavender Grey accent
    adk:     "#0D1B2A",
    pill:    "#15202F",
    input:   "#1B263B",
    header:  "#415A77",    // Dusk Blue header
  },
};

/** Metadata for the theme picker UI */
const THEME_META = [
  {
    id:       "eva3",
    name:     "Royal Laurel",
    nameCN:   "皇家月桂",
    desc:     "Elegant gold and warm earth tones evoking luxury and comfort.",
    emoji:    "✨",
    lightKey: "eva3Light",
    darkKey:  "eva3Dark",
    colors: [
      { name: "Soft Gold", hex: "#C5A059", desc: "Warm, buttery elegance" },
      { name: "Ebony Wood", hex: "#4B433B", desc: "Rich, grounded sophistication" },
      { name: "Warm Cream", hex: "#FAF9F6", desc: "Soft, inviting lightness" },
    ],
  },
  {
    id:       "olive",
    name:     "Olive Garden Feast",
    nameCN:   "橄欖園盛宴",
    desc:     "Earthy olive and moss dance with creamy beige, warm gold, and rustic copper, evoking harvest feasts.",
    emoji:    "🫒",
    lightKey: "oliveLight",
    darkKey:  "oliveDark",
    colors: [
      { name: "Olive Leaf", hex: "#606C38", desc: "Muted green brushstrokes suggest olive trees and sunlit fields" },
      { name: "Black Forest", hex: "#283618", desc: "Intense, nearly black green invokes dense evergreens" },
      { name: "Cornsilk", hex: "#FEFAE0", desc: "Creamy pale yellow shade like fresh cornsilk" },
      { name: "Light Caramel", hex: "#DDA15E", desc: "Warm, buttery, and smooth—evokes syrupy caramel" },
      { name: "Copper", hex: "#BC6C25", desc: "Reddish-brown metallic gleam recalls glinting coins" },
    ],
  },
  {
    id:       "forest",
    name:     "Earthy Forest Hues",
    nameCN:   "大地森林",
    desc:     "Olive green, rich moss, and earthy taupes conjure tranquil forests as rejuvenating outdoors.",
    emoji:    "🌲",
    lightKey: "forestLight",
    darkKey:  "forestDark",
    colors: [
      { name: "Dust Grey", hex: "#DAD7CD", desc: "Subtle, soft tone mirroring dusted stone" },
      { name: "Dry Sage", hex: "#A3B18A", desc: "Gentle, earthy yellow-green whispers calm" },
      { name: "Fern", hex: "#588157", desc: "Earthy and grounding, feels like sunlit leaves" },
      { name: "Hunter Green", hex: "#3A5A40", desc: "Evokes rugged wilderness and rich forest canopies" },
      { name: "Pine Teal", hex: "#344E41", desc: "Cool teal whispers of pine needles and mountain rivers" },
    ],
  },
  {
    id:       "elegance",
    name:     "Black & Gold Elegance",
    nameCN:   "黑金優雅",
    desc:     "Bold black, regal gold, deep navy, and luminous whites exude class, assurance, and creative power.",
    emoji:    "👔",
    lightKey: "eleganceLight",
    darkKey:  "eleganceDark",
    colors: [
      { name: "Black", hex: "#000000", desc: "Complete absorption of light radiates sophistication and strength" },
      { name: "Prussian Blue", hex: "#14213D", desc: "Inky, profound blue filled with gravitas and mystery" },
      { name: "Orange", hex: "#FCA311", desc: "Pure vibrant spectrum orange energizes the senses" },
      { name: "Alabaster Grey", hex: "#E5E5E5", desc: "Pale, misty grey whispers of modern elegance" },
      { name: "White", hex: "#FFFFFF", desc: "Brilliant and absolute, reflecting endless possibility" },
    ],
  },
  {
    id:       "deepSea",
    name:     "Deep Sea",
    nameCN:   "深海",
    desc:     "Midnight navy, foggy teal, and arctic white channel oceanic depths and serene power for mystery.",
    emoji:    "🌊",
    lightKey: "deepSeaLight",
    darkKey:  "deepSeaDark",
    colors: [
      { name: "Ink Black", hex: "#0D1B2A", desc: "Ultra-dark with a hint of blue, reminiscent of deep inkwells" },
      { name: "Prussian Blue", hex: "#1B263B", desc: "Inky, profound blue filled with gravitas and mystery" },
      { name: "Dusk Blue", hex: "#415A77", desc: "Elegant blend of twilight blues, reminiscent of clear evening skies" },
      { name: "Lavender Grey", hex: "#778DA9", desc: "Muted, elegant blend of purple and grey" },
      { name: "Alabaster Grey", hex: "#E0E1DD", desc: "Pale, misty grey whispers of modern elegance" },
    ],
  },
  {
    id:       "pastel",
    name:     "Pastel Dreamland",
    nameCN:   "粉彩夢境",
    desc:     "Whimsical violets, candy pinks, and gentle blues swirl together, evoking sweet clouds and daydreams.",
    emoji:    "🦄",
    lightKey: "pastelLight",
    darkKey:  "pastelDark",
    colors: [
      { name: "Pink Orchid", hex: "#C0B4DB", desc: "Creamy pastel lavender-pink fusion, radiates gentle affection" },
      { name: "Pastel Petal", hex: "#FFC8DD", desc: "Feather-light blend of blush and gentle lilac" },
      { name: "Blush Pop", hex: "#FFAFCC", desc: "Gleaming sugary pink mixes delicacy and high energy" },
      { name: "Icy Blue", hex: "#BDE0FE", desc: "Frosty pale blue as fresh as morning ice" },
      { name: "Sky Blue", hex: "#A2D2FF", desc: "Bright and whimsical, radiates freedom and happy adventures" },
    ],
  },
  {
    id:       "berry",
    name:     "Bold Berry",
    nameCN:   "大膽漿果",
    desc:     "Caramel, blush, berry velvet, and deepest violet exude playful boldness with magnetic charm.",
    emoji:    "🍓",
    lightKey: "berryLight",
    darkKey:  "berryDark",
    colors: [
      { name: "Soft Apricot", hex: "#F9DBBD", desc: "Delicate peachy shade evoking warmth and freshness" },
      { name: "Cotton Candy", hex: "#FFA5AB", desc: "Playful sweetness and dreamy charm" },
      { name: "Blush Rose", hex: "#DA627D", desc: "Vibrant yet elegant, rich tones recall romantic sunsets" },
      { name: "Cherry Rose", hex: "#A53860", desc: "Luscious deep pink exudes confidence and stirring passion" },
      { name: "Crimson Violet", hex: "#450920", desc: "Velvety dark berry shade pulses with passionate energy" },
    ],
  },
  {
    id:       "purple",
    name:     "Purple Dream",
    nameCN:   "紫色夢幻",
    desc:     "Magentas and lavenders swirl together, enveloping a fantasy of majestic, surreal violets.",
    emoji:    "💜",
    lightKey: "purpleLight",
    darkKey:  "purpleDark",
    colors: [
      { name: "Dark Amethyst", hex: "#231942", desc: "Intense shadowy violet exudes depth and moody sophistication" },
      { name: "Dusty Grape", hex: "#5E548E", desc: "Smoky grape delivers understated elegance and timeless sophistication" },
      { name: "Amethyst Smoke", hex: "#9F86C0", desc: "Misty fusion of lavender and silver, enveloping spaces with mystery" },
      { name: "Lilac", hex: "#BE95C4", desc: "Delicate vintage purple with silvery undertones for nostalgic elegance" },
      { name: "Pink Orchid", hex: "#E0B1CB", desc: "Creamy pastel lavender-pink fusion, radiates gentle affection" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.5  FONT SYSTEM
// Multiple font options for users to customize their reading experience.
// ─────────────────────────────────────────────────────────────────────────────

const FONTS = [
  {
    id: "syne",
    name: "Syne Modern",
    nameCN: "現代感",
    family: "'Syne', 'Noto Sans JP', sans-serif",
    desc: "Bold, geometric, contemporary — the default CrewLog look",
    emoji: "✨",
  },
  {
    id: "inter",
    name: "Inter Clean",
    nameCN: "簡潔",
    family: "'Inter', 'Noto Sans JP', sans-serif",
    desc: "Clean, readable, professional — perfect for data-heavy views",
    emoji: "📊",
  },
  {
    id: "poppins",
    name: "Poppins Friendly",
    nameCN: "友善",
    family: "'Poppins', 'Noto Sans JP', sans-serif",
    desc: "Warm, approachable, rounded — great for casual logging",
    emoji: "😊",
  },
  {
    id: "space",
    name: "Space Grotesk",
    nameCN: "科技感",
    family: "'Space Grotesk', 'Noto Sans JP', sans-serif",
    desc: "Technical, precise, aviation-inspired — cockpit aesthetic",
    emoji: "✈️",
  },
  {
    id: "playfair",
    name: "Playfair Display",
    nameCN: "優雅襯線",
    family: "'Playfair Display', 'Noto Serif JP', serif",
    desc: "Elegant serif with high contrast — sophisticated and editorial",
    emoji: "📰",
  },
  {
    id: "cormorant",
    name: "Cormorant Garamond",
    nameCN: "經典襯線",
    family: "'Cormorant Garamond', 'Noto Serif JP', serif",
    desc: "Classic book typography — refined and timeless",
    emoji: "📚",
  },
  {
    id: "dm-serif",
    name: "DM Serif Display",
    nameCN: "展示襯線",
    family: "'DM Serif Display', 'Noto Serif JP', serif",
    desc: "Bold serif with personality — confident and striking",
    emoji: "🎭",
  },
  {
    id: "jetbrains",
    name: "JetBrains Mono",
    nameCN: "等寬字體",
    family: "'JetBrains Mono', 'Courier New', monospace",
    desc: "Monospace for technical precision — developer-inspired clarity",
    emoji: "💻",
  },
  {
    id: "source-code",
    name: "Source Code Pro",
    nameCN: "程式碼",
    family: "'Source Code Pro', 'Courier New', monospace",
    desc: "Clean monospace — perfect for structured data and flight numbers",
    emoji: "🔢",
  },
  {
    id: "rubik",
    name: "Rubik Rounded",
    nameCN: "圓潤",
    family: "'Rubik', 'Noto Sans JP', sans-serif",
    desc: "Soft corners, playful energy — friendly and modern",
    emoji: "🔵",
  },
  {
    id: "outfit",
    name: "Outfit",
    nameCN: "時尚",
    family: "'Outfit', 'Noto Sans JP', sans-serif",
    desc: "Fashion-forward, sleek, contemporary — trendy and bold",
    emoji: "👗",
  },
  {
    id: "abril",
    name: "Abril Fatface",
    nameCN: "粗體展示",
    family: "'Abril Fatface', 'Noto Serif JP', serif",
    desc: "Dramatic display serif — bold headlines with vintage charm",
    emoji: "🎪",
  },
  {
    id: "dancing",
    name: "Dancing Script",
    nameCN: "手寫風格",
    family: "'Dancing Script', 'Noto Sans JP', cursive",
    desc: "Flowing handwritten style — personal and warm",
    emoji: "✍️",
  },
  {
    id: "pacifico",
    name: "Pacifico",
    nameCN: "海灘風",
    family: "'Pacifico', 'Noto Sans JP', cursive",
    desc: "Retro surf vibe — laid-back and cheerful",
    emoji: "🏄",
  },
  {
    id: "montserrat",
    name: "Montserrat",
    nameCN: "都會",
    family: "'Montserrat', 'Noto Sans JP', sans-serif",
    desc: "Urban typography inspired by Buenos Aires — confident and strong",
    emoji: "🏙️",
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// §4  FIRESTORE DOCUMENT REFERENCES
// ─────────────────────────────────────────────────────────────────────────────

/** Shared Firestore document — holds crew[] and routes[] for ALL users. */
const SHARED_DOC = doc(db, "crewlog", "shared");

/** Accounts Firestore document — holds individual username→{password,email} map. */
const ACCOUNTS_DOC = doc(db, "crewlog", "accounts");

/** Password-reset OTPs — holds temporary codes: { [username]: { code, expiry } }. */
const RESETS_DOC = doc(db, "crewlog", "resets");

/**
 * Usage tracking — public metadata only, NO private flight content.
 * Shape: { [username]: { joinedAt, lastLogin, flightCount } }
 * Admin can read this; nobody can read another user's actual flights.
 */
const USAGE_DOC = doc(db, "crewlog", "usage");

/**
 * App-wide settings doc — admin-controlled flags.
 * Shape: { registrationOpen: boolean }
 */
const APP_SETTINGS_DOC = doc(db, "crewlog", "appSettings");

/** Per-user private Firestore document — holds flights[] visible only to owner. */
const flightDoc = (username) => doc(db, "crewlog", `flights-${username}`);


// ─────────────────────────────────────────────────────────────────────────────
// §5  DATA MODEL SHAPES  (for reference — JS has no types)
// ─────────────────────────────────────────────────────────────────────────────

/*
  Crew member object:
  {
    id:         string   — employee ID (unique primary key)
    nickname:   string   — English callsign / display name
    name:       string   — Chinese/Japanese full name
    seniority:  string   — training batch e.g. "24G"
    status:     "red" | "yellow" | "green" | null
    tags:       string[] — subset of allTags
    notes:      string   — long-form shared notes
  }

  Flight log entry:
  {
    id:         string   — mkId()
    crewId:     string   — references crew.id
    date:       string   — "YYYY-MM-DD"
    flightNum:  string   — e.g. "CI001"
    route:      string   — e.g. "TPE→NRT"
    aircraft:   string   — one of AIRCRAFT
    position:   string   — one of POSITIONS or custom
    memo:       string   — private free-text note
    // NOTE: status & tags are NOT stored per-flight; they update the crew object
  }

  Saved route object:
  { id, flightNum, route, aircraft }
*/

/** Default (empty) form state for QuickLogView. */
const EMPTY_FORM = {
  crewId:    "",
  crewTxt:   "",
  date:      "",
  flightNum: "",
  route:     "",
  aircraft:  "",
  position:  "",
  memo:      "",
  status:    null,
  tags:      [],
};


// ─────────────────────────────────────────────────────────────────────────────
// §6  GLOBAL STYLES  (injected via <style> tag in each screen)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the global style string for the given theme.
 * Includes font imports, box-model reset, scrollbar styling,
 * and mobile UX tweaks (tap highlight, overscroll lock, button feedback).
 */
const makeGlobalStyles = (c, isDark, fontFamily = "'Syne','Noto Sans JP',sans-serif") => `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@400;500;700&family=Inter:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Serif+Display:wght@400&family=JetBrains+Mono:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500;600;700&family=Rubik:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Abril+Fatface&family=Dancing+Script:wght@400;500;600;700&family=Pacifico&family=Montserrat:wght@400;500;600;700;800&display=swap');

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  html, body, #root {
    overflow-x: hidden;
    touch-action: pan-y;
    overscroll-behavior: none;
    background: ${c.bg};
    min-height: 100vh;
    min-height: 100dvh;
  }

  input, textarea, button {
    font-family: ${fontFamily};
  }

  /* Prevent iOS Safari from zooming in when an input is focused.
     Safari zooms whenever the focused element's font-size < 16 px.
     Setting font-size:16px here and using transform to visually scale
     back down is the safest cross-browser fix.                        */
  input, textarea, select {
    font-size: 16px !important;
    touch-action: manipulation;
  }

  input::placeholder, textarea::placeholder {
    color: ${c.sub};
    opacity: 1;
  }

  ::-webkit-scrollbar            { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track      { background: transparent; }
  ::-webkit-scrollbar-thumb      { background: ${c.border}; border-radius: 2px; }

  input[type=date]::-webkit-calendar-picker-indicator {
    filter: ${isDark ? "invert(0.65)" : "none"};
    opacity: 0.7;
  }

  button { transition: transform .1s, opacity .1s; }
  button:active { transform: scale(0.93); opacity: 0.8; }

  textarea { outline: none; }
`;


// ═════════════════════════════════════════════════════════════════════════════
// §7  SHARED UI PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════════

// ─── §7.1  Dot ───────────────────────────────────────────────────────────────
/**
 * A small glowing circle used to represent a crew member's status.
 * Falls back to the theme border colour when no status is set.
 */
function Dot({ status, sz = 10, c }) {
  const col = status ? STATUS_MAP[status].color : c.border;
  return (
    <span style={{
      display:      "inline-block",
      width:        sz,
      height:       sz,
      borderRadius: "50%",
      background:   col,
      flexShrink:   0,
      boxShadow:    status ? `0 0 6px ${col}70` : 0,
    }} />
  );
}

// ─── §7.2  Tag ───────────────────────────────────────────────────────────────
/**
 * Toggle pill button used for tag selection / filtering.
 * Highlighted (accent) when `on` is true.
 */
function Tag({ on, onClick, children, c }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   on ? c.accent : c.pill,
        color:        on ? c.adk    : c.sub,
        border:       "none",
        borderRadius: 20,
        padding:      "5px 12px",
        fontSize:     12,
        fontWeight:   700,
        cursor:       "pointer",
        fontFamily:   "inherit",
        transition:   "all .15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── §7.3  NavBar ─────────────────────────────────────────────────────────────
/**
 * Top navigation bar shared by all full-page views.
 * Shows an optional back button, a two-line title block, and an optional right slot.
 */
function NavBar({ title, sub, onBack, right, c }) {
  return (
    <div style={{
      paddingTop:    "max(16px, env(safe-area-inset-top, 0px))",
      paddingLeft:   16,
      paddingRight:  16,
      paddingBottom: 12,
      background:    c.header || c.card,
      borderBottom:  `1px solid ${c.border}`,
      flexShrink:    0,
      display:       "flex",
      alignItems:    "center",
      gap:           10,
      position:      "sticky",
      top:           0,
      zIndex:        10,
    }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background:   "rgba(255,255,255,0.15)",
            border:       "none",
            color:        c.header ? "#FFFFFF" : c.sub,
            borderRadius: 10,
            padding:      "8px 12px",
            cursor:       "pointer",
            fontSize:     18,
            flexShrink:   0,
          }}
        >
          ←
        </button>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: c.header ? "rgba(255,255,255,0.7)" : c.accent, fontWeight: 700 }}>{sub}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.header ? "#FFFFFF" : c.text }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

// ─── §7.4  Sect ──────────────────────────────────────────────────────────────
/**
 * Section container with a small uppercase label above its children.
 * Used to group related form fields or settings rows.
 */
function Sect({ label, children, c }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize:      10,
        letterSpacing: 3,
        color:         c.sub,
        fontWeight:    700,
        marginBottom:  8,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── §7.5  SyncBadge ─────────────────────────────────────────────────────────
/**
 * Small icon that reflects the current Firestore sync state:
 *   ⏳ loading · ☁️ synced · ⚠️ error
 */
function SyncBadge({ syncStatus, c }) {
  const map = {
    loading: { icon: "⏳", color: c.sub        },
    synced:  { icon: "☁️", color: "#30D158"    },
    error:   { icon: "⚠️", color: "#FF453A"    },
  };
  const s = map[syncStatus];
  return <span style={{ fontSize: 13, color: s.color }}>{s.icon}</span>;
}

// ─── §7.6  SettingsRow ───────────────────────────────────────────────────────
/**
 * A single tappable row used inside the Settings screen.
 * Supports an icon, primary label, subtitle, a custom right element,
 * and an optional danger (red) variant.
 */
function SettingsRow({ icon, label, sub, onClick, right, c, danger }) {
  return (
    <div
      onClick={onClick}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           12,
        padding:       "13px 14px",
        background:    c.card,
        border:        `1px solid ${danger ? "rgba(255,69,58,0.3)" : c.border}`,
        borderRadius:  14,
        cursor:        onClick ? "pointer" : "default",
        marginBottom:  8,
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: "center" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? "#FF453A" : c.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: c.sub, marginTop: 1 }}>{sub}</div>}
      </div>
      {right || (onClick && <span style={{ color: c.sub, fontSize: 16 }}>›</span>)}
    </div>
  );
}


// ─── §7.7  ClearableInput ─────────────────────────────────────────────────────
/**
 * A text <input> with a × clear button that appears whenever the field has a value.
 * Accepts all standard input props plus the shared `c` theme object.
 * Pass `style` for the input's own styles (the wrapper handles positioning).
 */
function ClearableInput({ value, onChange, style, c, inputRef, ...rest }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        style={{
          ...style,
          paddingRight: value ? 36 : style?.paddingRight ?? 14,
          width: "100%",
        }}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange({ target: { value: "" } }); }}
          onTouchEnd={e => { e.preventDefault(); onChange({ target: { value: "" } }); }}
          style={{
            position:   "absolute", right: 10, top: "50%",
            transform:  "translateY(-50%)",
            background: "none", border: "none",
            color:      c.sub, cursor: "pointer",
            fontSize:   17, lineHeight: 1, padding: "0 2px",
            touchAction: "manipulation",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

// ─── §7.8  ClearableTextarea ──────────────────────────────────────────────────
/**
 * A <textarea> with a × clear button pinned to the top-right corner.
 */
function ClearableTextarea({ value, onChange, style, c, ...rest }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <textarea
        value={value}
        onChange={onChange}
        style={{ ...style, paddingRight: value ? 32 : style?.paddingRight ?? 14, width: "100%" }}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange({ target: { value: "" } }); }}
          onTouchEnd={e => { e.preventDefault(); onChange({ target: { value: "" } }); }}
          style={{
            position:   "absolute", right: 8, top: 10,
            background: "none", border: "none",
            color:      c.sub, cursor: "pointer",
            fontSize:   17, lineHeight: 1, padding: "0 2px",
            touchAction: "manipulation",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

// Displays aggregated flight analytics: top crew, routes, aircraft, monthly
// breakdown, and the crew status-light distribution.
// ═════════════════════════════════════════════════════════════════════════════
function StatsView({ crew, flights, onBack, showAcStats, showRouteStats, c }) {

  // ── Derived statistics ──────────────────────────────────────────────────
  const totalFlights  = flights.length;
  const uniqueCrew    = [...new Set(flights.map(f => f.crewId))].length;

  /**
   * Deduplicated flights for route/aircraft stats.
   * If multiple crew members log the same flightNum on the same date,
   * that is ONE physical flight — count it once.
   * Key: flightNum+date when flightNum exists; date+route+aircraft otherwise.
   */
  const seenKeys = new Set();
  const uniqueFlights = flights.filter(f => {
    const key = f.flightNum
      ? `${f.flightNum}_${f.date}`
      : `${f.date}_${f.route || ""}_${f.aircraft || ""}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const uniqueRoutes  = [...new Set(uniqueFlights.filter(f => f.route).map(f => f.route))].length;

  // Most flown crew (top 5) — still counts per-person entries (intentional)
  const crewCount = {};
  flights.forEach(f => { crewCount[f.crewId] = (crewCount[f.crewId] || 0) + 1; });
  const topCrew = Object.entries(crewCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const m = crew.find(x => x.id === id);
      return { id, count, name: m ? m.nickname : id, fullName: m ? m.name : "" };
    });

  // Most flown routes (top 5) — deduplicated: same flight by multiple crew = 1
  const routeCount = {};
  uniqueFlights.forEach(f => { if (f.route) routeCount[f.route] = (routeCount[f.route] || 0) + 1; });
  const topRoutes = Object.entries(routeCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Aircraft usage — deduplicated: same flight by multiple crew = 1
  const acCount = {};
  uniqueFlights.forEach(f => { if (f.aircraft) acCount[f.aircraft] = (acCount[f.aircraft] || 0) + 1; });
  const topAc = Object.entries(acCount).sort((a, b) => b[1] - a[1]);

  // Flights by month (last 6) — deduplicated
  const monthCount = {};
  uniqueFlights.forEach(f => {
    if (f.date) { const m = f.date.slice(0, 7); monthCount[m] = (monthCount[m] || 0) + 1; }
  });
  const months = Object.entries(monthCount).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  // Crew status breakdown (counts crew members, not flights)
  const statusCount = { green: 0, yellow: 0, red: 0, none: 0 };
  crew.forEach(m => { statusCount[m.status || "none"]++; });

  // ── Sub-components ───────────────────────────────────────────────────────

  /** Summary card with icon, large number, and label. */
  const StatCard = ({ icon, value, label }) => (
    <div style={{
      background:   c.cardAlt,
      border:       `1px solid ${c.border}`,
      borderRadius: 14,
      padding:      "14px 12px",
      textAlign:    "center",
      flex:         1,
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: c.accent }}>{value}</div>
      <div style={{ fontSize: 10, color: c.sub, letterSpacing: 1, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );

  /** Horizontal bar showing a label and proportional count. */
  const Bar = ({ label, count, max }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{
        fontSize:       13, fontWeight: 700, color: c.text,
        minWidth:       80, overflow:   "hidden",
        textOverflow:   "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 20, background: c.pill, borderRadius: 8, overflow: "hidden" }}>
        <div style={{
          height:          "100%",
          width:           `${max ? Math.round(count / max * 100) : 0}%`,
          background:      `${c.accent}99`,
          borderRadius:    8,
          minWidth:        count ? 24 : 0,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "flex-end",
          paddingRight:    6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.adk }}>{count}</span>
        </div>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar sub="STATISTICS" title="飛行統計 📊" onBack={onBack} c={c} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>

        {/* Overview row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <StatCard icon="✈" value={totalFlights}       label="LOG ENTRIES" />
          <StatCard icon="🛫" value={uniqueFlights.length} label="FLIGHTS"   />
          <StatCard icon="🗺" value={uniqueRoutes}       label="ROUTES"      />
        </div>

        {totalFlights === 0 ? (
          <div style={{ textAlign: "center", color: c.sub, fontSize: 14, padding: "40px 0" }}>
            尚無紀錄，開始新增飛行吧！<br />No flights logged yet.
          </div>
        ) : (
          <>
            {/* Top Crew */}
            {topCrew.length > 0 && (
              <Sect label="最常合飛 TOP CREW" c={c}>
                <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
                  {topCrew.map((t, i) => (
                    <div key={t.id} style={{
                      display:      "flex", alignItems: "center", gap: 10,
                      padding:      "8px 0",
                      borderBottom: i < topCrew.length - 1 ? `1px solid ${c.border}` : "none",
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: i === 0 ? c.accent : c.sub, width: 24, textAlign: "center" }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: c.text }}>{t.name}</span>
                        <span style={{ color: c.sub, fontSize: 12, marginLeft: 8 }}>{t.fullName}</span>
                      </div>
                      <span style={{ fontWeight: 800, color: c.accent, fontSize: 15 }}>{t.count}</span>
                      <span style={{ fontSize: 10, color: c.sub }}>次</span>
                    </div>
                  ))}
                </div>
              </Sect>
            )}

            {/* Top Routes */}
            {showRouteStats && topRoutes.length > 0 && (
              <Sect label="熱門航線 TOP ROUTES" c={c}>
                <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
                  {topRoutes.map(([route, count]) => (
                    <Bar key={route} label={route} count={count} max={topRoutes[0][1]} />
                  ))}
                </div>
              </Sect>
            )}

            {/* Aircraft */}
            {showAcStats && topAc.length > 0 && (
              <Sect label="機型統計 AIRCRAFT" c={c}>
                <div style={{ display: "flex", gap: 8 }}>
                  {topAc.map(([ac, count]) => (
                    <div key={ac} style={{
                      flex: 1, background: c.card, border: `1px solid ${c.border}`,
                      borderRadius: 14, padding: "12px 8px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{ac}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c.accent, marginTop: 4 }}>{count}</div>
                      <div style={{ fontSize: 10, color: c.sub }}>次</div>
                    </div>
                  ))}
                </div>
              </Sect>
            )}

            {/* Monthly */}
            {months.length > 0 && (
              <Sect label="月份紀錄 BY MONTH" c={c}>
                <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
                  {months.map(([month, count]) => (
                    <Bar key={month} label={month} count={count} max={months[0][1]} />
                  ))}
                </div>
              </Sect>
            )}

            {/* Status breakdown */}
            <Sect label="組員燈號分佈 STATUS" c={c}>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <div key={k} style={{
                    flex: 1, background: v.bg, border: `1px solid ${v.border}`,
                    borderRadius: 14, padding: "12px 8px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 20 }}>{v.emoji}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: v.color, marginTop: 4 }}>{statusCount[k]}</div>
                  </div>
                ))}
                {/* "No status" bucket */}
                <div style={{
                  flex: 1, background: c.cardAlt, border: `1px solid ${c.border}`,
                  borderRadius: 14, padding: "12px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20 }}>⚪</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c.sub, marginTop: 4 }}>{statusCount.none}</div>
                </div>
              </div>
            </Sect>
          </>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// §9  SETTINGS VIEW
// User preferences: account, dark mode, defaults, custom tags,
// saved routes, data backup/import, and danger zone.
// ═════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// §11  THEME GALLERY VIEW
// Displays all available themes with their color palettes and allows selection.
// ─────────────────────────────────────────────────────────────────────────────

function ThemeGalleryView({ onBack, themeKey, setThemeKey, c }) {
  const [selectedTheme, setSelectedTheme] = useState(null);

  const currentThemeId = THEME_META.find(
    m => m.lightKey === themeKey || m.darkKey === themeKey
  )?.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar sub="THEMES" title="主題畫廊 🎨" onBack={onBack} c={c} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>
        
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 6 }}>
            選擇你的外觀 CHOOSE YOUR LOOK
          </div>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.5 }}>
            Quick toggle between light and dark modes. Tap the description to see detailed color palettes.
          </div>
        </div>

        {/* Theme Cards */}
        {THEME_META.map(meta => {
          const isActive = meta.id === currentThemeId;
          const isExpanded = selectedTheme === meta.id;
          const usingLight = themeKey === meta.lightKey;
          const usingDark = themeKey === meta.darkKey;

          return (
            <div key={meta.id} style={{ marginBottom: 14 }}>
              {/* Theme Header - Always Visible */}
              <div
                style={{
                  background: isActive ? `${c.accent}15` : c.card,
                  border: `1px solid ${isActive ? c.accent : c.border}`,
                  borderRadius: 16,
                  padding: "14px 16px",
                }}
              >
                {/* Top row: Icon, Name, Active Badge */}
                <div 
                  onClick={() => setSelectedTheme(isExpanded ? null : meta.id)}
                  style={{ 
                    display: "flex", 
                    alignItems: "flex-start", 
                    gap: 12, 
                    marginBottom: 10,
                    cursor: "pointer"
                  }}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{meta.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: isActive ? c.accent : c.text, marginBottom: 2 }}>
                      {meta.name}
                    </div>
                    <div style={{ fontSize: 11, color: c.sub, fontWeight: 600 }}>
                      {meta.nameCN}
                    </div>
                  </div>
                  {isActive && (
                    <div style={{ 
                      fontSize: 10, 
                      fontWeight: 700, 
                      color: c.accent, 
                      background: `${c.accent}20`, 
                      borderRadius: 8, 
                      padding: "3px 10px",
                      whiteSpace: "nowrap"
                    }}>
                      ✓ 使用中
                    </div>
                  )}
                </div>

                {/* Quick Mode Toggle */}
                <div style={{ display: "flex", gap: 6, marginBottom: meta.desc ? 8 : 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setThemeKey(meta.lightKey); }}
                    style={{
                      flex: 1,
                      background: usingLight ? c.accent : c.pill,
                      color: usingLight ? c.adk : c.sub,
                      border: "none",
                      borderRadius: 10,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ☀ Light
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setThemeKey(meta.darkKey); }}
                    style={{
                      flex: 1,
                      background: usingDark ? c.accent : c.pill,
                      color: usingDark ? c.adk : c.sub,
                      border: "none",
                      borderRadius: 10,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    🌙 Dark
                  </button>
                </div>

                {/* Description */}
                {meta.desc && (
                  <div 
                    onClick={() => setSelectedTheme(isExpanded ? null : meta.id)}
                    style={{ 
                      fontSize: 12, 
                      color: c.sub, 
                      lineHeight: 1.5, 
                      fontStyle: "italic",
                      borderTop: `1px solid ${c.border}`,
                      paddingTop: 8,
                      marginTop: 8,
                      cursor: "pointer"
                    }}
                  >
                    {meta.desc}
                  </div>
                )}
              </div>

              {/* Expanded Color Palette (Optional - tap description to expand) */}
              {isExpanded && (
                <div style={{ 
                  background: c.cardAlt, 
                  border: `1px solid ${c.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 16px 16px",
                  padding: "12px 16px 16px",
                  marginTop: -1
                }}>
                  {/* Colors Section */}
                  {meta.colors && meta.colors.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: c.sub, fontWeight: 700, marginBottom: 10 }}>
                        COLORS
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {meta.colors.map((color, idx) => (
                          <div 
                            key={idx}
                            style={{ 
                              display: "flex", 
                              alignItems: "flex-start", 
                              gap: 10,
                              background: c.card,
                              borderRadius: 10,
                              padding: "8px 10px"
                            }}
                          >
                            {/* Color Swatch */}
                            <div 
                              style={{ 
                                width: 32, 
                                height: 32, 
                                borderRadius: 8, 
                                background: color.hex,
                                border: `1px solid ${c.border}`,
                                flexShrink: 0
                              }} 
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                                  ~{color.name}
                                </span>
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: c.sub }}>
                                  {color.hex}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: c.sub, lineHeight: 1.4 }}>
                                {color.desc}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer Note */}
        <div style={{ 
          textAlign: "center", 
          fontSize: 11, 
          color: c.sub, 
          marginTop: 24,
          padding: "12px 16px",
          background: c.cardAlt,
          borderRadius: 12
        }}>
          💡 Tip: Your theme preference is saved automatically
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// §11.5  FONT GALLERY VIEW
// Displays all available fonts and allows selection.
// ─────────────────────────────────────────────────────────────────────────────

function FontGalleryView({ onBack, fontKey, setFontKey, c }) {
  const currentFont = FONTS.find(f => f.id === fontKey) || FONTS[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar sub="FONTS" title="字體畫廊 🔤" onBack={onBack} c={c} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>
        
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 6 }}>
            選擇你的字體風格 CHOOSE YOUR FONT STYLE
          </div>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.5 }}>
            Each font card displays in its own typeface. Tap to select and see your entire app transform.
          </div>
        </div>

        {/* Font Cards */}
        {FONTS.map(f => {
          const isActive = fontKey === f.id;

          return (
            <button
              key={f.id}
              onClick={() => setFontKey(f.id)}
              style={{
                width: "100%",
                background: isActive ? `${c.accent}15` : c.card,
                border: `1px solid ${isActive ? c.accent : c.border}`,
                borderRadius: 16,
                padding: "14px 16px",
                marginBottom: 12,
                cursor: "pointer",
                fontFamily: f.family,
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 700, 
                    color: isActive ? c.accent : c.text,
                    marginBottom: 2
                  }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, marginBottom: 4 }}>
                    {f.nameCN}
                  </div>
                  <div style={{ fontSize: 12, color: c.sub, lineHeight: 1.4, fontStyle: "italic" }}>
                    {f.desc}
                  </div>
                </div>
                {isActive && (
                  <div style={{ 
                    fontSize: 10, 
                    fontWeight: 700, 
                    color: c.accent, 
                    background: `${c.accent}20`, 
                    borderRadius: 8, 
                    padding: "3px 10px",
                    flexShrink: 0
                  }}>
                    ✓ 使用中
                  </div>
                )}
              </div>
              
              {/* Font Preview Sample */}
              <div style={{
                background: c.cardAlt,
                borderRadius: 10,
                padding: "10px 12px",
                borderTop: `1px solid ${c.border}`,
              }}>
                <div style={{ 
                  fontSize: 18, 
                  fontWeight: 700, 
                  color: c.text, 
                  marginBottom: 4,
                  lineHeight: 1.3
                }}>
                  CrewLog 我的天空日記
                </div>
                <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.5 }}>
                  Flight BR189 TPE→NRT 合飛組員紀錄
                </div>
              </div>
            </button>
          );
        })}

        {/* Footer Note */}
        <div style={{ 
          textAlign: "center", 
          fontSize: 11, 
          color: c.sub, 
          marginTop: 24,
          padding: "12px 16px",
          background: c.cardAlt,
          borderRadius: 12
        }}>
          💡 Tip: Each card displays in its actual font for live preview
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// §12  SETTINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────

function SettingsView({
  onBack, c, themeKey, setThemeKey, fontKey, setFontKey, username, onLogout, onExport, onGoGuide, onGoStats, onGoThemes, onGoFonts,
  defaultAircraft, setDefaultAircraft, defaultPosition, setDefaultPosition,
  customTags, setCustomTags, onImport, routes, setRoutes, flights,
}) {
  const dark = themeKey?.endsWith("Dark") ?? true;
  const [newTag,       setNewTag]       = useState("");
  const [addTagErr,    setAddTagErr]    = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [nameEdit,     setNameEdit]     = useState(false);
  const [tempName,     setTempName]     = useState(username);
  const [nameErr,      setNameErr]      = useState("");
  const [importMsg,    setImportMsg]    = useState("");
  const [emailBakMsg,  setEmailBakMsg]  = useState("");

  // ── Account management state ─────────────────────────────────────────────
  const [accounts,       setAccounts]       = useState({});
  const [accsLoading,    setAccsLoading]    = useState(true);
  const [newAccUser,     setNewAccUser]     = useState("");
  const [newAccPass,     setNewAccPass]     = useState("");
  const [newAccEmail,    setNewAccEmail]    = useState("");
  const [newAccErr,      setNewAccErr]      = useState("");
  const [newAccOk,       setNewAccOk]       = useState("");
  const [delAccConfirm,  setDelAccConfirm]  = useState("");
  // Change password
  const [changePwOpen,   setChangePwOpen]   = useState(false);
  const [changePwCur,    setChangePwCur]    = useState("");
  const [changePwNew,    setChangePwNew]    = useState("");
  const [changePwConf,   setChangePwConf]   = useState("");
  const [changePwErr,    setChangePwErr]    = useState("");
  const [changePwOk,     setChangePwOk]     = useState("");
  // Email management
  const [emailEdit,      setEmailEdit]      = useState(false);
  const [tempEmail,      setTempEmail]      = useState("");
  const [emailErr,       setEmailErr]       = useState("");
  const [emailOk,        setEmailOk]        = useState("");
  // Usage tracking (admin-only — no private content)
  const [usageData,        setUsageData]        = useState({});
  const [regOpen,          setRegOpen]          = useState(false);   // local copy of toggle
  const [regOpenLoading,   setRegOpenLoading]   = useState(false);
  const [showAcStats,      setShowAcStats]      = useState(true);    // aircraft stats visible
  const [showRouteStats,   setShowRouteStats]   = useState(true);    // top routes visible
  const [statsToggleLoading, setStatsToggleLoading] = useState(false);

  const isAdmin = username === "adminsetup";

  const fileRef = useRef(null);

  const allTags = [...PRESET_TAGS, ...customTags];

  /** Shared input style used throughout this view. */
  const inp = {
    background:   c.input,
    border:       `1px solid ${c.border}`,
    borderRadius: 12,
    padding:      "11px 14px",
    color:        c.text,
    fontSize:     14,
    fontFamily:   "inherit",
    outline:      "none",
    width:        "100%",
  };

  // ── Load accounts + usage + appSettings from Firestore on mount ────────────────
  useEffect(() => {
    Promise.all([getDoc(ACCOUNTS_DOC), getDoc(USAGE_DOC), getDoc(APP_SETTINGS_DOC)])
      .then(([accSnap, usageSnap, settSnap]) => {
        const accs = accSnap.exists() ? (accSnap.data().accounts || {}) : {};
        setAccounts(accs);
        // Initialize tempEmail with current user's email
        const userAcct = typeof accs[username] === "object" 
          ? accs[username] 
          : { password: accs[username], email: "" };
        setTempEmail(userAcct.email || "");
        
        setUsageData(usageSnap.exists() ? (usageSnap.data().usage   || {}) : {});
        if (settSnap.exists()) {
          const s = settSnap.data();
          setRegOpen(s.registrationOpen === true);
          setShowAcStats(s.showAcStats    !== false); // default true
          setShowRouteStats(s.showRouteStats !== false); // default true
        }
      })
      .catch(() => {})
      .finally(() => setAccsLoading(false));
  }, [username]);

  /** Add a new account to Firestore */
  const addAccount = async () => {
    const u = newAccUser.trim();
    const p = newAccPass.trim();
    const e = newAccEmail.trim();
    if (!u) { setNewAccErr("請輸入用戶名 Enter username"); return; }
    if (!p) { setNewAccErr("請輸入密碼 Enter password");   return; }
    if (p.length < 6) { setNewAccErr("密碼至少 6 位 Min 6 chars"); return; }
    if (u.length > 20) { setNewAccErr("用戶名太長 Username too long"); return; }
    // Normalise existing accounts to object format before checking
    const existing = Object.fromEntries(
      Object.entries(accounts).map(([k, v]) => [k, typeof v === "object" ? v : { password: v, email: "" }])
    );
    if (existing[u]) { setNewAccErr(`"${u}" 已存在 Username already taken — choose another`); return; }
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setNewAccErr("電郵格式錯誤 Invalid email"); return; }
    const updated = { ...existing, [u]: { password: p, email: e } };
    await setDoc(ACCOUNTS_DOC, { accounts: updated });
    setAccounts(updated);
    setNewAccUser(""); setNewAccPass(""); setNewAccEmail(""); setNewAccErr("");
    setNewAccOk(`✅ "${u}" 已新增 Added`);
    setTimeout(() => setNewAccOk(""), 3000);
  };

  /** Delete an account from Firestore */
  const deleteAccount = async (u) => {
    const updated = Object.fromEntries(
      Object.entries(accounts)
        .filter(([k]) => k !== u)
        .map(([k, v]) => [k, typeof v === "object" ? v : { password: v, email: "" }])
    );
    await setDoc(ACCOUNTS_DOC, { accounts: updated });
    setAccounts(updated);
    setDelAccConfirm("");
  };

  /** Toggle the open-registration flag in Firestore (admin only) */
  const toggleRegistration = async (val) => {
    setRegOpenLoading(true);
    try {
      const snap = await getDoc(APP_SETTINGS_DOC);
      const curr = snap.exists() ? snap.data() : {};
      await setDoc(APP_SETTINGS_DOC, { ...curr, registrationOpen: val });
      setRegOpen(val);
    } catch { /* silent */ }
    finally { setRegOpenLoading(false); }
  };

  /** Toggle a stats visibility flag in Firestore (admin only) */
  const toggleStatsSetting = async (key, val, setter) => {
    setStatsToggleLoading(true);
    try {
      const snap = await getDoc(APP_SETTINGS_DOC);
      const curr = snap.exists() ? snap.data() : {};
      await setDoc(APP_SETTINGS_DOC, { ...curr, [key]: val });
      setter(val);
    } catch { /* silent */ }
    finally { setStatsToggleLoading(false); }
  };

  /** Change current user's password */
  const changePassword = async () => {
    if (!changePwCur)                         { setChangePwErr("請輸入現有密碼"); return; }
    if (!changePwNew)                         { setChangePwErr("請輸入新密碼"); return; }
    if (changePwNew.length < 6)               { setChangePwErr("密碼至少 6 位 Min 6 chars"); return; }
    if (changePwNew !== changePwConf)         { setChangePwErr("密碼不一致 Passwords don't match"); return; }

    const acct = typeof accounts[username] === "object"
      ? accounts[username]
      : { password: accounts[username], email: "" };
    if (acct.password !== changePwCur) { setChangePwErr("現有密碼錯誤 Wrong current password"); return; }

    const normalised = Object.fromEntries(
      Object.entries(accounts).map(([k, v]) => [k, typeof v === "object" ? v : { password: v, email: "" }])
    );
    const updated = { ...normalised, [username]: { ...acct, password: changePwNew } };
    await setDoc(ACCOUNTS_DOC, { accounts: updated });
    setAccounts(updated);
    setChangePwCur(""); setChangePwNew(""); setChangePwConf(""); setChangePwErr("");
    setChangePwOk("✅ 密碼已更新 Password updated!");
    setTimeout(() => { setChangePwOk(""); setChangePwOpen(false); }, 2500);
  };

  /** Update current user's email address */
  const updateEmail = async () => {
    const email = tempEmail.trim();
    
    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr("電郵格式錯誤 Invalid email format");
      return;
    }

    try {
      const acct = typeof accounts[username] === "object"
        ? accounts[username]
        : { password: accounts[username], email: "" };

      const normalised = Object.fromEntries(
        Object.entries(accounts).map(([k, v]) => [k, typeof v === "object" ? v : { password: v, email: "" }])
      );
      const updated = { ...normalised, [username]: { ...acct, email } };
      await setDoc(ACCOUNTS_DOC, { accounts: updated });
      setAccounts(updated);
      setEmailErr("");
      setEmailOk(email ? "✅ 電郵已更新 Email updated!" : "✅ 電郵已移除 Email removed!");
      setTimeout(() => { setEmailOk(""); setEmailEdit(false); }, 2500);
    } catch (err) {
      setEmailErr("更新失敗 Update failed");
      console.error(err);
    }
  };

  /** Reads an imported JSON backup and passes it to the parent handler. */
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onImport(data);
        setImportMsg("✅ 匯入成功 Import successful!");
      } catch {
        setImportMsg("❌ 檔案格式錯誤 Invalid JSON file");
      }
      setTimeout(() => setImportMsg(""), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /**
   * Saves a new username to localStorage and reloads the page.
   * Reload is necessary to switch the Firestore flight document path.
   */
  const handleNameSave = () => {
    const name = tempName.trim();
    if (!name)          { setNameErr("請輸入名字"); return; }
    if (name.length > 20) { setNameErr("名字太長了"); return; }
    localStorage.setItem("cl-username", name);
    window.location.reload();
  };

  /** Adds a new custom tag (with # prefix normalisation and duplicate check). */
  /** Sends a JSON backup to the user's registered email via EmailJS */
  const emailBackup = async () => {
    setEmailBakMsg("發送中...");
    try {
      // Get user's email from accounts doc
      const snap     = await getDoc(ACCOUNTS_DOC);
      const accounts = snap.exists() ? (snap.data().accounts || {}) : {};
      const acct     = typeof accounts[username] === "object" ? accounts[username] : { email: "" };
      const email    = acct.email || "";
      if (!email) {
        setEmailBakMsg("❌ 未設定電郵 No email on file — ask admin to add one");
        setTimeout(() => setEmailBakMsg(""), 4000);
        return;
      }
      const data    = { crew: "hidden", flights: `${flights.length} entries`, routes: "hidden", exportedAt: new Date().toISOString(), note: "Full backup available via Download Backup button." };
      const summary = `You have ${flights.length} private flight log entries as of ${new Date().toLocaleDateString()}.`;
      await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          service_id:  EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id:     EMAILJS_PUBLIC_KEY,
          template_params: { to_email: email, username, otp_code: summary },
        }),
      });
      setEmailBakMsg(`✅ 摘要已發送至 ${email}`);
    } catch {
      setEmailBakMsg("❌ 發送失敗 Send failed");
    }
    setTimeout(() => setEmailBakMsg(""), 4000);
  };

  const addCustomTag = () => {
    const tag = newTag.trim().startsWith("#") ? newTag.trim() : `#${newTag.trim()}`;
    if (!tag || tag === "#") return;
    if (allTags.includes(tag)) { setAddTagErr("此標籤已存在"); return; }
    setCustomTags(ct => [...ct, tag]);
    setNewTag("");
    setAddTagErr("");
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar sub="SETTINGS" title="設定 ⚙" onBack={onBack} c={c} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>

        {/* ── Account ── */}
        <Sect label="帳號 ACCOUNT" c={c}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            {/* Username + flight count */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>👤</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{username}</div>
                <div style={{ fontSize: 11, color: c.sub }}>{flights.length} 筆私人飛行紀錄</div>
              </div>
            </div>
            {/* Registered email — read-only reminder */}
            {(() => {
              const acct  = typeof accounts[username] === "object" ? accounts[username] : { email: "" };
              const email = acct?.email || "";
              return (
                <div style={{ background: c.cardAlt, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>✉️</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, color: c.sub, fontWeight: 700, marginBottom: 2 }}>登記電郵 REGISTERED EMAIL</div>
                    {email
                      ? <div style={{ fontSize: 13, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
                      : <div style={{ fontSize: 12, color: "#FF453A" }}>⚠ 未設定 — 無法使用忘記密碼功能</div>
                    }
                  </div>
                </div>
              );
            })()}
            {/* Name-edit section */}
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => { setNameEdit(!nameEdit); setTempName(username); setNameErr(""); }}
                style={{ background: c.pill, border: "none", color: c.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                {nameEdit ? "取消" : "✏ 改名"}
              </button>
            </div>
            {nameEdit && (
              <div style={{ marginTop: 10 }}>
                <ClearableInput
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  placeholder="新名字..."
                  autoComplete="off"
                  style={{ ...inp, marginBottom: nameErr ? 6 : 10, fontSize: 14 }}
                  c={c}
                />
                {nameErr && <div style={{ color: "#FF453A", fontSize: 11, marginBottom: 6 }}>{nameErr}</div>}
                <div style={{ fontSize: 10, color: "#FF453A", marginBottom: 8 }}>
                  ⚠ 改名後會重新載入，新的飛行紀錄會存在新名字下
                </div>
                <button
                  onClick={handleNameSave}
                  style={{ width: "100%", background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  💾 儲存新名字
                </button>
              </div>
            )}
          </div>
        </Sect>

        {/* ── Theme Picker ── */}
        <Sect label="外觀主題 THEMES" c={c}>
          <SettingsRow 
            icon="🎨" 
            label={(() => {
              const current = THEME_META.find(m => m.lightKey === themeKey || m.darkKey === themeKey);
              return current ? `${current.name} ${current.emoji}` : "Select Theme";
            })()} 
            sub={`當前使用 ${dark ? '深色 🌙' : '淺色 ☀'} 模式 · 點擊探索更多主題`}
            onClick={onGoThemes}
            c={c}
          />
        </Sect>

        {/* ── Font Selector ── */}
        <Sect label="字體樣式 FONT STYLE" c={c}>
          <SettingsRow 
            icon="🔤" 
            label={(() => {
              const current = FONTS.find(f => f.id === fontKey);
              return current ? `${current.name} ${current.emoji}` : "Select Font";
            })()} 
            sub={`當前字體 · 點擊探索 ${FONTS.length} 種字體選項`}
            onClick={onGoFonts}
            c={c}
          />
        </Sect>

        {/* ── Quick Actions ── */}
        <Sect label="快速操作 QUICK ACTIONS" c={c}>
          <SettingsRow icon="📊" label="飛行統計 Stats"      sub="查看你的飛行數據摘要"  onClick={onGoStats} c={c} />
          <SettingsRow icon="❓" label="使用說明 Guide"      sub="如何使用 CrewLog"      onClick={onGoGuide} c={c} />
        </Sect>

        {/* ── Defaults ── */}
        <Sect label="預設值 DEFAULTS" c={c}>
          {/* Default Aircraft */}
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 8 }}>✈ 預設機型 Default Aircraft</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDefaultAircraft("")}
                style={{ background: !defaultAircraft ? c.accent : c.pill, color: !defaultAircraft ? c.adk : c.sub, border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                無 None
              </button>
              {AIRCRAFT.map(a => (
                <button
                  key={a}
                  onClick={() => setDefaultAircraft(defaultAircraft === a ? "" : a)}
                  style={{ flex: 1, background: defaultAircraft === a ? c.accent : c.pill, color: defaultAircraft === a ? c.adk : c.sub, border: "none", borderRadius: 10, padding: "8px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {/* Default Position */}
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 8 }}>💺 預設職位 Default Position</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <button
                onClick={() => setDefaultPosition("")}
                style={{ background: !defaultPosition ? c.accent : c.pill, color: !defaultPosition ? c.adk : c.sub, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                無 None
              </button>
              {POSITIONS.map(p => (
                <button
                  key={p}
                  onClick={() => setDefaultPosition(defaultPosition === p ? "" : p)}
                  style={{ background: defaultPosition === p ? c.accent : c.pill, color: defaultPosition === p ? c.adk : c.sub, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </Sect>

        {/* ── Custom Tags ── */}
        <Sect label="自訂標籤 CUSTOM TAGS" c={c}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, color: c.sub, marginBottom: 10 }}>內建標籤不可刪除，自訂標籤可新增刪除</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {PRESET_TAGS.map(t => (
                <span key={t} style={{ background: c.pill, color: c.sub, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                  {t} <span style={{ fontSize: 9, opacity: 0.5 }}>🔒</span>
                </span>
              ))}
              {customTags.map(t => (
                <span key={t} style={{ background: c.accent + "22", color: c.accent, borderRadius: 20, padding: "5px 8px 5px 12px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  {t}
                  <button
                    onClick={() => setCustomTags(ct => ct.filter(x => x !== t))}
                    style={{ background: "none", border: "none", color: "#FF453A", fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ClearableInput
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                placeholder="#自訂標籤..."
                autoComplete="off"
                onKeyDown={e => e.key === "Enter" && addCustomTag()}
                style={{ ...inp, flex: 1, fontSize: 13, padding: "9px 12px" }}
                c={c}
              />
              <button
                onClick={addCustomTag}
                style={{ background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
              >
                + 新增
              </button>
            </div>
            {addTagErr && <div style={{ color: "#FF453A", fontSize: 11, marginTop: 6 }}>{addTagErr}</div>}
          </div>
        </Sect>

        {/* ── Saved Routes ── */}
        <Sect label="已存航班 SAVED ROUTES" c={c}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            {routes.length === 0 ? (
              <div style={{ color: c.sub, fontSize: 13, textAlign: "center", padding: "8px 0" }}>
                尚無已存航班<br />No saved routes
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {routes.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: c.cardAlt, borderRadius: 10, padding: "8px 10px" }}>
                    <span style={{ fontWeight: 700, color: c.text, fontSize: 13 }}>{r.flightNum}</span>
                    {r.route    && <span style={{ color: c.sub, fontSize: 12 }}>{r.route}</span>}
                    {r.aircraft && <span style={{ background: c.pill, color: c.accent, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>{r.aircraft}</span>}
                    <button
                      onClick={() => setRoutes(rs => rs.filter(x => x.id !== r.id))}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: "#FF453A", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Sect>

        {/* ── Data Management ── */}
        <Sect label="資料管理 DATA" c={c}>
          <SettingsRow icon="⬇" label="備份資料 Backup" sub="下載 JSON 備份檔"       onClick={onExport}                  c={c} />
          <SettingsRow icon="📤" label="匯入備份 Import" sub="從 JSON 檔案還原資料"  onClick={() => fileRef.current?.click()} c={c} />
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: "none" }} />
          {importMsg && (
            <div style={{
              background:   importMsg.startsWith("✅") ? "rgba(48,209,88,0.1)"  : "rgba(255,69,58,0.1)",
              border:       `1px solid ${importMsg.startsWith("✅") ? "rgba(48,209,88,0.4)" : "rgba(255,69,58,0.4)"}`,
              borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600,
              color:        importMsg.startsWith("✅") ? "#30D158" : "#FF453A",
              marginBottom: 8,
            }}>
              {importMsg}
            </div>
          )}
        </Sect>

        {/* ── Change Password ── */}
        <Sect label="更改密碼 CHANGE PASSWORD" c={c}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            {!changePwOpen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>🔑 {username}</div>
                  <div style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>更新你的登入密碼</div>
                </div>
                <button
                  onClick={() => { setChangePwOpen(true); setChangePwErr(""); setChangePwOk(""); }}
                  style={{ background: c.pill, border: "none", color: c.accent, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  ✏ 更改
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: c.sub, fontWeight: 700, marginBottom: 10 }}>CHANGE PASSWORD</div>
                <ClearableInput
                  type="password"
                  value={changePwCur}
                  onChange={e => { setChangePwCur(e.target.value); setChangePwErr(""); }}
                  placeholder="Current password"
                  style={{ ...inp, marginBottom: 8, fontSize: 14 }}
                  c={c}
                />
                <ClearableInput
                  type="password"
                  value={changePwNew}
                  onChange={e => { setChangePwNew(e.target.value); setChangePwErr(""); }}
                  placeholder="New password (min 6)"
                  style={{ ...inp, marginBottom: 8, fontSize: 14 }}
                  c={c}
                />
                <ClearableInput
                  type="password"
                  value={changePwConf}
                  onChange={e => { setChangePwConf(e.target.value); setChangePwErr(""); }}
                  onKeyDown={e => e.key === "Enter" && changePassword()}
                  placeholder="Confirm new password"
                  style={{ ...inp, marginBottom: changePwErr || changePwOk ? 8 : 12, fontSize: 14 }}
                  c={c}
                />
                {changePwErr && <div style={{ color: "#FF453A",  fontSize: 11, marginBottom: 10 }}>{changePwErr}</div>}
                {changePwOk  && <div style={{ color: "#30D158",  fontSize: 11, marginBottom: 10 }}>{changePwOk}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={changePassword}
                    style={{ flex: 1, background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    💾 儲存
                  </button>
                  <button
                    onClick={() => { setChangePwOpen(false); setChangePwCur(""); setChangePwNew(""); setChangePwConf(""); setChangePwErr(""); }}
                    style={{ flex: 1, background: c.pill, color: c.sub, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, cursor: "pointer" }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </Sect>

        {/* ── Email Address ── */}
        <Sect label="電郵地址 EMAIL ADDRESS" c={c}>
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
            {!emailEdit ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>
                    📧 {tempEmail || "未設定 Not set"}
                  </div>
                  <div style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>
                    {tempEmail 
                      ? "用於密碼重設 Used for password reset"
                      : "設定電郵以啟用密碼重設功能 Set email to enable password reset"
                    }
                  </div>
                </div>
                <button
                  onClick={() => { 
                    setEmailEdit(true); 
                    setEmailErr(""); 
                    setEmailOk(""); 
                  }}
                  style={{ background: c.pill, border: "none", color: c.accent, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  {tempEmail ? "✏ 更改" : "+ 新增"}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: c.sub, fontWeight: 700, marginBottom: 10 }}>
                  {tempEmail ? "UPDATE EMAIL" : "ADD EMAIL"}
                </div>
                <ClearableInput
                  type="email"
                  value={tempEmail}
                  onChange={e => { setTempEmail(e.target.value); setEmailErr(""); }}
                  onKeyDown={e => e.key === "Enter" && updateEmail()}
                  placeholder="your.email@example.com"
                  style={{ ...inp, marginBottom: emailErr || emailOk ? 8 : 12, fontSize: 14 }}
                  c={c}
                />
                {emailErr && <div style={{ color: "#FF453A", fontSize: 11, marginBottom: 10 }}>{emailErr}</div>}
                {emailOk  && <div style={{ color: "#30D158", fontSize: 11, marginBottom: 10 }}>{emailOk}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={updateEmail}
                    style={{ flex: 1, background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    💾 儲存
                  </button>
                  <button
                    onClick={() => { 
                      setEmailEdit(false); 
                      // Reset to current saved email
                      const acct = typeof accounts[username] === "object"
                        ? accounts[username]
                        : { password: accounts[username], email: "" };
                      setTempEmail(acct.email || ""); 
                      setEmailErr(""); 
                    }}
                    style={{ flex: 1, background: c.pill, color: c.sub, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, cursor: "pointer" }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </Sect>

        {/* ── Account Management (admin only) ── */}
        {isAdmin && (
          <>
            {/* ── Admin Overview ── */}
            <Sect label="管理員概覽 ADMIN OVERVIEW" c={c}>
              {/* Account counter */}
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: c.accent, borderRadius: 12, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 22 }}>👥</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: c.text, lineHeight: 1 }}>
                      {accsLoading ? "—" : Object.keys(accounts).length}
                    </div>
                    <div style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>帳號總數 Total Accounts</div>
                  </div>
                </div>
              </div>

              {/* Registration toggle */}
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 3 }}>
                      {regOpen ? "✅ 開放註冊中" : "🔒 註冊已關閉"}
                    </div>
                    <div style={{ fontSize: 11, color: c.sub, lineHeight: 1.5 }}>
                      {regOpen
                        ? "New users can create their own account from the login screen."
                        : "Only admin can add accounts. Login shows \"Registration not available\"."
                      }
                    </div>
                  </div>
                  <button
                    onClick={() => !regOpenLoading && toggleRegistration(!regOpen)}
                    disabled={regOpenLoading}
                    style={{ width: 52, height: 30, borderRadius: 15, border: "none", cursor: regOpenLoading ? "default" : "pointer", background: regOpen ? c.accent : c.pill, position: "relative", flexShrink: 0, transition: "background 0.2s" }}
                  >
                    <div style={{ position: "absolute", top: 3, left: regOpen ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: regOpen ? c.adk : c.sub, transition: "left 0.2s" }} />
                  </button>
                </div>
              </div>

              {/* Stats visibility toggles */}
              {[
                { key: "showAcStats",    val: showAcStats,    setter: setShowAcStats,    label: "機型統計 Aircraft Stats",  sub: "Show aircraft breakdown in Statistics" },
                { key: "showRouteStats", val: showRouteStats, setter: setShowRouteStats, label: "熱門航線 Top Routes",       sub: "Show top routes chart in Statistics" },
              ].map(({ key, val, setter, label, sub }) => (
                <div key={key} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 3 }}>
                        {val ? `✅ ${label}` : `🚫 ${label}`}
                      </div>
                      <div style={{ fontSize: 11, color: c.sub }}>{sub}</div>
                    </div>
                    <button
                      onClick={() => !statsToggleLoading && toggleStatsSetting(key, !val, setter)}
                      disabled={statsToggleLoading}
                      style={{ width: 52, height: 30, borderRadius: 15, border: "none", cursor: statsToggleLoading ? "default" : "pointer", background: val ? c.accent : c.pill, position: "relative", flexShrink: 0, transition: "background 0.2s" }}
                    >
                      <div style={{ position: "absolute", top: 3, left: val ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: val ? c.adk : c.sub, transition: "left 0.2s" }} />
                    </button>
                  </div>
                </div>
              ))}
            </Sect>

            {/* ── Activity Monitor ── */}
            <Sect label="活動監控 ACTIVITY MONITOR 🛡" c={c}>
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: c.sub, marginBottom: 12, lineHeight: 1.6 }}>
                  帳號活動摘要 · Account name, last login & flight count only.<br />
                  <span style={{ color: c.accent, fontWeight: 700 }}>Private flight contents are never visible here.</span>
                </div>
                {accsLoading ? (
                  <div style={{ color: c.sub, fontSize: 12 }}>載入中...</div>
                ) : Object.keys(accounts).length === 0 ? (
                  <div style={{ color: c.sub, fontSize: 12, textAlign: "center", padding: "8px 0" }}>No accounts yet</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {/* Header row */}
                    <div style={{ display: "flex", gap: 8, padding: "4px 8px", marginBottom: 4 }}>
                      <span style={{ flex: 1, fontSize: 9, letterSpacing: 2, color: c.sub, fontWeight: 700 }}>USERNAME</span>
                      <span style={{ width: 80, fontSize: 9, letterSpacing: 1, color: c.sub, fontWeight: 700, textAlign: "center" }}>LAST LOGIN</span>
                      <span style={{ width: 36, fontSize: 9, letterSpacing: 1, color: c.sub, fontWeight: 700, textAlign: "center" }}>✈</span>
                      <span style={{ width: 24 }} />
                    </div>
                    {Object.keys(accounts).map(u => {
                      const stat      = usageData[u] || {};
                      const lastLogin = stat.lastLogin
                        ? new Date(stat.lastLogin).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                        : "—";
                      const flights   = stat.flightCount ?? "—";
                      const daysAgo   = stat.lastLogin
                        ? Math.floor((Date.now() - new Date(stat.lastLogin)) / 86400000)
                        : null;
                      const inactive  = daysAgo !== null && daysAgo > 30;
                      return (
                        <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, background: c.cardAlt, borderRadius: 10, padding: "8px 10px", marginBottom: 4, border: `1px solid ${inactive ? "rgba(255,69,58,0.2)" : "transparent"}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, color: c.text, fontSize: 13 }}>{u}</span>
                            {u === username && <span style={{ fontSize: 9, color: c.accent, marginLeft: 6 }}>YOU</span>}
                            {inactive && <span style={{ fontSize: 9, color: "#FF453A", marginLeft: 6 }}>INACTIVE {daysAgo}d</span>}
                          </div>
                          <span style={{ width: 80, fontSize: 10, color: c.sub, textAlign: "center" }}>{lastLogin}</span>
                          <span style={{ width: 36, fontSize: 12, fontWeight: 700, color: c.accent, textAlign: "center" }}>{flights}</span>
                          {delAccConfirm === u ? (
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <button onClick={() => deleteAccount(u)} style={{ background: "#FF453A", color: "#fff", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>確認</button>
                              <button onClick={() => setDelAccConfirm("")} style={{ background: c.pill, color: c.sub, border: "none", borderRadius: 6, padding: "3px 6px", fontSize: 10, cursor: "pointer" }}>取消</button>
                            </div>
                          ) : (
                            u !== username ? (
                              <button onClick={() => setDelAccConfirm(u)} style={{ background: "none", border: "none", color: "#FF453A", cursor: "pointer", fontSize: 15, padding: "0 2px", flexShrink: 0 }}>×</button>
                            ) : <span style={{ width: 20 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Sect>

            {/* ── Add Account ── */}
            <Sect label="新增帳號 ADD ACCOUNT" c={c}>
              <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: c.sub, marginBottom: 12 }}>
                  新增組員帳號 · Username, password and email for password reset
                </div>
                <ClearableInput
                  value={newAccUser}
                  onChange={e => { setNewAccUser(e.target.value); setNewAccErr(""); }}
                  placeholder="Username"
                  autoComplete="off"
                  style={{ ...inp, fontSize: 13, padding: "9px 12px", marginBottom: 8 }}
                  c={c}
                />
                <ClearableInput
                  type="password"
                  value={newAccPass}
                  onChange={e => { setNewAccPass(e.target.value); setNewAccErr(""); }}
                  placeholder="Password (min 6 chars)"
                  autoComplete="new-password"
                  style={{ ...inp, fontSize: 13, padding: "9px 12px", marginBottom: 8 }}
                  c={c}
                />
                <ClearableInput
                  value={newAccEmail}
                  onChange={e => { setNewAccEmail(e.target.value); setNewAccErr(""); }}
                  placeholder="Email (required for password reset)"
                  autoComplete="off"
                  type="email"
                  style={{ ...inp, fontSize: 13, padding: "9px 12px", marginBottom: newAccErr ? 6 : 10 }}
                  c={c}
                />
                {newAccErr && <div style={{ color: "#FF453A", fontSize: 11, marginBottom: 8 }}>{newAccErr}</div>}
                {newAccOk  && <div style={{ color: "#30D158", fontSize: 11, marginBottom: 8 }}>{newAccOk}</div>}
                <button
                  onClick={addAccount}
                  style={{ width: "100%", background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  + 新增帳號 Add Account
                </button>
              </div>
            </Sect>
          </>
        )}

        {/* ── Danger Zone ── */}
        <Sect label="危險區域 DANGER ZONE" c={c}>
          {confirmClear ? (
            <div style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.4)", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FF453A", marginBottom: 6 }}>確定要清除所有飛行紀錄？</div>
              <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>
                This will delete ALL your private flight logs. Shared crew data will NOT be affected.<br />⚠ Cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { onImport({ flights: [] }); setConfirmClear(false); }}
                  style={{ flex: 1, background: "#FF453A", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                >
                  確認清除
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  style={{ flex: 1, background: c.pill, color: c.sub, border: "none", borderRadius: 10, padding: "11px", fontSize: 13, cursor: "pointer" }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <SettingsRow icon="🗑" label="清除飛行紀錄 Clear Logs" sub="刪除所有私人飛行紀錄" onClick={() => setConfirmClear(true)} c={c} danger />
          )}
          <div style={{ marginTop: 4 }}>
            <SettingsRow icon="🚪" label="登出 Logout" sub={`目前登入：${username}`} onClick={onLogout} c={c} danger />
          </div>
        </Sect>

        {/* About */}
        <div style={{ textAlign: "center", padding: "16px 0 4px", color: c.sub, fontSize: 11, lineHeight: 1.8 }}>
          CrewLog v2.0 · EVA Air Edition · Built with ✈ & ❤<br />
          <span style={{ color: c.accent, fontWeight: 700 }}>Your logs are safe & private.</span>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// §10  QUICK LOG VIEW
// Form for creating a new flight log or editing an existing one.
// When editing (editFlightId set): status & tags fields are hidden.
// When creating: status & tags are applied to the crew member object on save.
// ═════════════════════════════════════════════════════════════════════════════
function QuickLogView({ crew, routes, setRoutes, initialForm, editFlightId, onSave, onBack, c, allTags }) {
  const [form, setForm] = useState(initialForm);
  const [sugg, setSugg] = useState([]);   // crew search suggestions
  const [addR, setAddR] = useState(false); // show add-route panel
  const [rf,   setRf]   = useState({ num: "", route: "", ac: "" }); // new route fields

  // Sync form when a different flight is loaded for editing
  const prevEdit = useRef(editFlightId);
  useEffect(() => {
    if (prevEdit.current !== editFlightId) {
      setForm(initialForm);
      prevEdit.current = editFlightId;
    }
  }, [editFlightId, initialForm]);

  // ── Crew search ───────────────────────────────────────────────────────────

  /** Filters crew list as the user types; clears crewId until a match is picked. */
  const handleCrewInput = (val) => {
    setForm(f => ({ ...f, crewTxt: val, crewId: "" }));
    if (!val.trim()) { setSugg([]); return; }
    const q = val.toLowerCase();
    setSugg(
      crew.filter(m =>
        m.id.includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.nickname.toLowerCase().includes(q)
      ).slice(0, 5)
    );
  };

  /** Selects a crew member from the suggestion list. */
  const pickCrew = (m) => {
    setForm(f => ({
      ...f,
      crewId:  m.id,
      crewTxt: `${m.nickname} — ${m.name}`,
      status:  m.status ?? f.status,
      tags:    [...m.tags],
    }));
    setSugg([]);
  };

  // ── Saved route management ────────────────────────────────────────────────

  /** Appends a new saved route and collapses the add-route panel. */
  const saveRoute = () => {
    if (!rf.num.trim()) return;
    setRoutes(r => [...r, { id: mkId(), flightNum: rf.num.trim(), route: rf.route.trim(), aircraft: rf.ac }]);
    setRf({ num: "", route: "", ac: "" });
    setAddR(false);
  };

  /** Shared input style. */
  const inp = {
    background:   c.input,
    border:       `1px solid ${c.border}`,
    borderRadius: 12,
    padding:      "11px 14px",
    color:        c.text,
    fontSize:     14,
    fontFamily:   "inherit",
    outline:      "none",
    width:        "100%",
  };

  const tagsToShow = allTags || PRESET_TAGS;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar
        sub={editFlightId ? "EDIT LOG" : "QUICK-LOG"}
        title={editFlightId ? "編輯飛行紀錄" : "新增飛行紀錄"}
        onBack={onBack}
        c={c}
      />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>

        {/* ── Crew Search ── */}
        <Sect label="組員 CREW MEMBER" c={c}>
          <div style={{ position: "relative" }}>
            <ClearableInput
              value={form.crewTxt}
              onChange={e => handleCrewInput(e.target.value)}
              placeholder="搜尋 ID / 姓名 / Nickname..."
              disabled={!!editFlightId}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              style={{ ...inp, border: `1px solid ${form.crewId ? c.accent : c.border}`, opacity: editFlightId ? 0.7 : 1 }}
              c={c}
            />
            {/* Suggestion dropdown */}
            {sugg.length > 0 && (
              <div style={{
                position:     "absolute",
                top:          "calc(100% + 4px)",
                left:         0, right: 0,
                background:   c.card,
                border:       `1px solid ${c.border}`,
                borderRadius: 12,
                overflow:     "hidden",
                zIndex:       99,
                boxShadow:    "0 8px 32px rgba(0,0,0,.4)",
              }}>
                {sugg.map(m => (
                  <div
                    key={m.id}
                    onMouseDown={e => { e.preventDefault(); pickCrew(m); }}
                    style={{
                      padding:      "10px 14px",
                      cursor:       "pointer",
                      borderBottom: `1px solid ${c.border}`,
                      display:      "flex",
                      alignItems:   "center",
                      gap:          10,
                    }}
                  >
                    <Dot status={m.status} sz={9} c={c} />
                    <span style={{ fontWeight: 700, color: c.text }}>{m.nickname}</span>
                    <span style={{ color: c.sub, fontSize: 12 }}>{m.name}</span>
                    <span style={{ color: c.sub, fontSize: 11, marginLeft: "auto" }}>#{m.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {form.crewId && (
            <div style={{ marginTop: 5, fontSize: 12, color: c.accent, fontWeight: 600 }}>✓ ID: {form.crewId}</div>
          )}
        </Sect>

        {/* ── Date ── */}
        <Sect label="日期 DATE" c={c}>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={inp}
          />
        </Sect>

        {/* ── Flight Number & Route ── */}
        <Sect label="航班 FLIGHT" c={c}>
          {/* Quick-pick saved routes */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {routes.map(r => (
              <button
                key={r.id}
                onClick={() => setForm(f => ({ ...f, flightNum: r.flightNum, route: r.route, aircraft: r.aircraft }))}
                style={{
                  background:   form.flightNum === r.flightNum ? c.accent : c.pill,
                  color:        form.flightNum === r.flightNum ? c.adk    : c.sub,
                  border:       "none", borderRadius: 10, padding: "6px 12px",
                  fontSize:     12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {r.flightNum}{r.route && ` · ${r.route}`}
              </button>
            ))}
            <button
              onClick={() => setAddR(v => !v)}
              style={{ background: "transparent", border: `1px dashed ${c.border}`, color: c.sub, borderRadius: 10, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
            >
              {addR ? "▲" : "+"} 新增航班
            </button>
          </div>

          {/* Add-route panel */}
          {addR && (
            <div style={{ background: c.cardAlt, border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: c.accent, fontWeight: 700, marginBottom: 8 }}>ADD ROUTE</div>
              <ClearableInput value={rf.num}   onChange={e => setRf(r => ({ ...r, num:   e.target.value }))} placeholder="航班號 e.g. CI001"    autoComplete="off" style={{ ...inp, marginBottom: 6, borderRadius: 10, padding: "8px 12px", fontSize: 13 }} c={c} />
              <ClearableInput value={rf.route} onChange={e => setRf(r => ({ ...r, route: e.target.value.toUpperCase() }))} placeholder="航線 e.g. TPE→NRT" autoComplete="off" style={{ ...inp, marginBottom: 6, borderRadius: 10, padding: "8px 12px", fontSize: 13 }} c={c} />
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {AIRCRAFT.map(a => (
                  <button
                    key={a}
                    onClick={() => setRf(r => ({ ...r, ac: a }))}
                    style={{ flex: 1, background: rf.ac === a ? c.accent : c.pill, color: rf.ac === a ? c.adk : c.sub, border: "none", borderRadius: 8, padding: "7px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveRoute}           style={{ flex: 1, background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>儲存</button>
                <button onClick={() => setAddR(false)} style={{ flex: 1, background: c.pill,   color: c.sub, border: "none", borderRadius: 10, padding: "9px", fontSize: 13, cursor: "pointer" }}>取消</button>
              </div>
            </div>
          )}

          {/* Manual entry fields */}
          <div style={{ display: "flex", gap: 8 }}>
            <ClearableInput value={form.flightNum} onChange={e => setForm(f => ({ ...f, flightNum: e.target.value.toUpperCase() }))} placeholder="航班號 No."  autoComplete="off" style={{ ...inp, width: "auto", flex: 1 }} c={c} />
            <ClearableInput value={form.route}     onChange={e => setForm(f => ({ ...f, route:     e.target.value.toUpperCase() }))} placeholder="航線 Route" autoComplete="off" style={{ ...inp, width: "auto", flex: 1 }} c={c} />
          </div>
        </Sect>

        {/* ── Aircraft ── */}
        <Sect label="機型 AIRCRAFT" c={c}>
          <div style={{ display: "flex", gap: 8 }}>
            {AIRCRAFT.map(a => (
              <button
                key={a}
                onClick={() => setForm(f => ({ ...f, aircraft: f.aircraft === a ? "" : a }))}
                style={{
                  flex:         1,
                  background:   form.aircraft === a ? c.accent : c.pill,
                  color:        form.aircraft === a ? c.adk    : c.sub,
                  border:       "none", borderRadius: 12, padding: "11px",
                  fontSize:     14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </Sect>

        {/* ── Position ── */}
        <Sect label="職位 POSITION" c={c}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {POSITIONS.map(p => (
              <button
                key={p}
                onClick={() => setForm(f => ({ ...f, position: f.position === p ? "" : p }))}
                style={{
                  background:   form.position === p ? c.accent : c.pill,
                  color:        form.position === p ? c.adk    : c.sub,
                  border:       "none", borderRadius: 8, padding: "6px 12px",
                  fontSize:     13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <ClearableInput
            value={form.position}
            onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
            placeholder="或自行輸入..."
            autoComplete="off"
            style={inp}
            c={c}
          />
        </Sect>

        {/* ── Status & Tags  (new flights only) ── */}
        {!editFlightId && (
          <>
            <Sect label="紅黃綠燈 STATUS" c={c}>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setForm(f => ({ ...f, status: f.status === k ? null : k }))}
                    style={{
                      flex:           1,
                      background:     form.status === k ? v.bg  : c.pill,
                      border:         `2px solid ${form.status === k ? v.color : c.border}`,
                      color:          form.status === k ? v.color : c.sub,
                      borderRadius:   14, padding: "13px 4px",
                      fontSize:       22, cursor: "pointer",
                      display:        "flex", flexDirection: "column", alignItems: "center", gap: 3,
                    }}
                  >
                    <span>{v.emoji}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>{k.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </Sect>

            <Sect label="標籤 TAGS" c={c}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {tagsToShow.map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}
                    style={{
                      background:   form.tags.includes(t) ? c.accent : c.pill,
                      color:        form.tags.includes(t) ? c.adk    : c.sub,
                      border:       "none", borderRadius: 20, padding: "6px 12px",
                      fontSize:     12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Sect>
          </>
        )}

        {/* ── Memo ── */}
        <Sect label="備忘 MEMO" c={c}>
          <ClearableTextarea
            value={form.memo}
            onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
            rows={3}
            placeholder="這次飛行的備忘..."
            style={{ ...inp, resize: "vertical" }}
            c={c}
          />
        </Sect>

        {/* ── Save Button ── */}
        <button
          onClick={() => onSave(form)}
          disabled={!form.crewId}
          style={{
            width:        "100%",
            background:   form.crewId ? c.accent : "#2a2a2a",
            color:        form.crewId ? c.adk    : "#555",
            border:       "none", borderRadius: 16, padding: "15px",
            fontSize:     16, fontWeight: 800,
            cursor:       form.crewId ? "pointer" : "not-allowed",
            letterSpacing: 1, fontFamily: "inherit",
            boxShadow:    form.crewId ? `0 4px 24px ${c.accent}55` : "none",
          }}
        >
          {editFlightId ? "✏ 更新紀錄 UPDATE LOG" : "✈ 儲存紀錄 SAVE LOG"}
        </button>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// §11  GUIDE VIEW
// Static user guide rendered from a structured data array.
// ═════════════════════════════════════════════════════════════════════════════
function GuideView({ onBack, c }) {
  const sections = [
    {
      emoji: "✈", title: "什麼是我的天空日記？", en: "What is CrewLog?",
      content: "CrewLog 是你的私人天空日記。記錄合飛組員，留下備忘，用紅黃綠燈標記好壞，幫助你下次飛行前做好心理準備。\n\nCrewLog is your private cabin crew companion — log who you fly with, leave notes, and mark them green, yellow, or red so you're never caught off-guard again.",
    },
    {
      emoji: "🔒", title: "隱私設計", en: "Privacy",
      content: "飛行紀錄 (備忘、航班) 是完全私人的 — 只有你看得到，不會同步給其他用戶。\n\n組員的基本資料 (名字、期別) 和紅黃綠燈、標籤則是大家共享的，讓整個 app 的資料保持最新。\n\nYour flight logs and memos are private (only you see them). Crew info, status lights, and tags are shared so everyone benefits.",
    },
    {
      emoji: "🔴🟡🟢", title: "紅黃綠燈", en: "Status Lights", isList: true,
      content: [
        { icon: "🟢", label: "推薦 Great!",   desc: "好合作、專業、值得信任的組員" },
        { icon: "🟡", label: "普通 Neutral",  desc: "一般，沒有特別好或壞" },
        { icon: "🔴", label: "注意 Warning",  desc: "需要注意，可搭配備忘說明原因" },
      ],
    },
    {
      emoji: "🏷", title: "標籤 Tags", en: "Tags", isList: true,
      content: [
        { icon: "#好咖", desc: "優秀的組員，合作愉快"    },
        { icon: "#難搞", desc: "不好合作，注意一下"      },
        { icon: "#細心", desc: "工作細心，注意到小細節"  },
        { icon: "#新人", desc: "新組員，需要多幫忙"      },
        { icon: "#好笑", desc: "幽默風趣，飛起來很開心"  },
        { icon: "#專業", desc: "工作態度專業"            },
        { icon: "#八卦", desc: "愛說話，要注意嘴型 👀"  },
        { icon: "#準時", desc: "很守時，不拖拖拉拉"      },
      ],
    },
    {
      emoji: "📝", title: "如何新增飛行紀錄", en: "How to Log a Flight",
      content: "1. 點右下角的 ＋ 按鈕，或點組員卡片上的 ＋\n2. 搜尋組員名字、ID 或 Nickname\n3. 選擇日期、航班、機型、職位\n4. 設定紅黃綠燈和標籤\n5. 寫下備忘，然後儲存！\n\nHit + → search crew → fill in details → save. Easy.",
    },
    {
      emoji: "🔍", title: "搜尋功能", en: "Search",
      content: "搜尋欄可以搜尋：\n• 組員 ID (員工號碼)\n• 中文姓名\n• 英文 Nickname\n• 飛行備忘的內容 (輸入兩個字以上)\n\n有備忘符合的組員會顯示 📝 提示。",
    },
    {
      emoji: "👤", title: "組員頁面", en: "Crew Profile",
      content: "點任何組員可以進入個人頁面：\n• 查看你們所有的合飛紀錄\n• 編輯組員基本資料（大家共享）\n• 新增長期筆記（大家共享）\n• 快速設定紅黃綠燈\n• 編輯或刪除個別飛行紀錄",
    },
    {
      emoji: "⬇", title: "備份資料", en: "Backup",
      content: "設定頁面的「備份」可以將所有資料下載成 JSON 檔案。建議定期備份，以防萬一。\n\nGo to Settings → Backup to download all your data as a JSON file.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar sub="USER GUIDE" title="使用說明 ✈" onBack={onBack} c={c} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>
        {/* Hero banner */}
        <div style={{
          background:   `linear-gradient(135deg, ${c.accent}22, ${c.accent}08)`,
          border:       `1px solid ${c.accent}44`,
          borderRadius: 20, padding: "20px 16px", marginBottom: 20, textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✈</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.text, marginBottom: 4 }}>我的天空日記</div>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
            記錄每一次合飛 · 留住每一個細節<br />Log every flight · Remember every detail
          </div>
        </div>

        {/* Guide sections */}
        {sections.map((s, i) => (
          <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: c.text }}>{s.title}</div>
                <div style={{ fontSize: 11, color: c.sub }}>{s.en}</div>
              </div>
            </div>
            {s.isList ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {s.content.map((item, j) => (
                  <div key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: c.cardAlt, borderRadius: 10, padding: "8px 10px" }}>
                    <span style={{ fontSize: 14, flexShrink: 0, fontWeight: 700, minWidth: 60, color: c.accent }}>{item.icon}</span>
                    <span style={{ fontSize: 13, color: c.sub, lineHeight: 1.5 }}>{item.desc}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.8, whiteSpace: "pre-line" }}>{s.content}</div>
            )}
          </div>
        ))}

        <div style={{ textAlign: "center", padding: "20px 0 4px", color: c.sub, fontSize: 11, lineHeight: 1.8 }}>
          CrewLog v2.0 · EVA Air Edition · Built with ✈ & ❤<br />
          <span style={{ color: c.accent, fontWeight: 700 }}>Your logs are safe & private.</span>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// §12  MY LOG VIEW
// Chronological personal logbook grouped by month, with crew search.
// ═════════════════════════════════════════════════════════════════════════════
function MyLogView({ flights, crew, username, onBack, onGoProfile, onEdit, c }) {
  const [search, setSearch] = useState("");

  // Sort all flights newest-first, then optionally filter by crew name / memo
  const sorted = [...flights].sort((a, b) => new Date(b.date) - new Date(a.date));
  const filtered = sorted.filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const m = crew.find(x => x.id === f.crewId);
    return (
      (m && (m.nickname.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))) ||
      (f.memo || "").toLowerCase().includes(q)
    );
  });

  // Group by YYYY-MM
  const grouped = {};
  filtered.forEach(f => {
    const month = f.date ? f.date.slice(0, 7) : "—";
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(f);
  });
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const inp = {
    background:   c.input, border: `1px solid ${c.border}`, borderRadius: 12,
    padding:      "9px 14px 9px 36px", color: c.text, fontSize: 14,
    fontFamily:   "inherit", outline: "none", width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <NavBar
        sub="MY LOGBOOK"
        title={`${username} 的飛行日記`}
        onBack={onBack}
        c={c}
        right={
          <span style={{ fontSize: 12, color: c.sub, fontWeight: 700, background: c.pill, borderRadius: 8, padding: "4px 10px" }}>
            {flights.length} 筆
          </span>
        }
      />

      {/* Search bar */}
      <div style={{ 
        padding: "10px 16px", 
        background: c.card, 
        borderBottom: `1px solid ${c.border}`, 
        flexShrink: 0,
        position: "sticky",
        top: "calc(env(safe-area-inset-top) + 56px)",
        zIndex: 9,
      }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: c.sub, zIndex: 1, pointerEvents: "none", fontSize: 14 }}>🔍</span>
          <ClearableInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋組員姓名或備忘..."
            autoComplete="off"
            style={inp}
            c={c}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 100px", WebkitOverflowScrolling: "touch" }}>

        {/* Empty states */}
        {flights.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: c.sub }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✈</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>尚無飛行紀錄</div>
            <div style={{ fontSize: 13 }}>點右下角 + 開始記錄你的第一次飛行</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: c.sub, fontSize: 14 }}>
            找不到符合「{search}」的紀錄
          </div>
        ) : (
          /* Monthly grouped list */
          months.map(month => (
            <div key={month} style={{ marginBottom: 28 }}>
              {/* Month divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: c.accent, flexShrink: 0 }}>
                  {month}
                </span>
                <div style={{ flex: 1, height: 1, background: c.border }} />
                <span style={{ fontSize: 10, color: c.sub, flexShrink: 0 }}>{grouped[month].length} 筆</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped[month].map(f => {
                  const m  = crew.find(x => x.id === f.crewId);
                  const si = m?.status ? STATUS_MAP[m.status] : null;
                  const hasMemo = !!f.memo?.trim();

                  return (
                    <div
                      key={f.id}
                      style={{
                        background:  c.card,
                        border:      `1px solid ${c.border}`,
                        borderLeft:  `3px solid ${si ? si.color : c.border}`,
                        borderRadius: 14,
                        padding:     "12px 14px",
                        display:     "flex",
                        gap:         12,
                        alignItems:  "flex-start",
                      }}
                    >
                      {/* Date column */}
                      <div style={{ flexShrink: 0, width: 36, paddingTop: 2, textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: c.text, lineHeight: 1 }}>
                          {f.date ? f.date.slice(8) : "—"}
                        </div>
                        <div style={{ fontSize: 9, color: c.sub, fontWeight: 600, marginTop: 2 }}>
                          {f.date ? ["SUN","MON","TUE","WED","THU","FRI","SAT"][new Date(f.date).getDay()] : ""}
                        </div>
                      </div>

                      <div style={{ width: 1, alignSelf: "stretch", background: c.border, flexShrink: 0 }} />

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Crew row — taps to profile */}
                        <div
                          onClick={() => m && onGoProfile(m.id)}
                          style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: hasMemo ? 7 : 0, cursor: m ? "pointer" : "default" }}
                        >
                          {si
                            ? <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{si.emoji}</span>
                            : <Dot status={null} sz={8} c={c} />
                          }
                          <span style={{ fontWeight: 800, fontSize: 15, color: c.text }}>
                            {m ? m.nickname : `#${f.crewId}`}
                          </span>
                          {m?.name && (
                            <span style={{ fontSize: 12, color: c.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.name}
                            </span>
                          )}
                          {f.flightNum && (
                            <span style={{ marginLeft: "auto", fontSize: 10, color: c.accent, fontWeight: 700, background: c.pill, borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>
                              {f.flightNum}
                            </span>
                          )}
                        </div>

                        {/* Memo preview (2-line clamp) */}
                        {hasMemo && (
                          <div style={{
                            fontSize: 12, color: c.sub, lineHeight: 1.55,
                            background: c.cardAlt, borderRadius: 8, padding: "6px 10px",
                            display: "-webkit-box", WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical", overflow: "hidden",
                          }}>
                            📝 {f.memo}
                          </div>
                        )}
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => onEdit(f)}
                        style={{ background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0, alignSelf: "flex-start" }}
                      >
                        ✏
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// §13  ROOT APP COMPONENT
// Owns all global state, Firestore sync, auth flow, and view routing.
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {

  // ── §13.1  Theme & Font ───────────────────────────────────────────────────
  const [themeKey, setThemeKey] = useState(() => {
    return localStorage.getItem("cl-theme") || "eva3Dark";
  });
  const [fontKey, setFontKey] = useState(() => {
    return localStorage.getItem("cl-font") || "syne";
  });
  
  const c      = THEMES[themeKey] || THEMES["eva3Dark"];
  const isDark = themeKey.endsWith("Dark");
  const font   = FONTS.find(f => f.id === fontKey) || FONTS[0];
  const gs     = makeGlobalStyles(c, isDark, font.family);

  // ── §13.2  Auth state ─────────────────────────────────────────────────────
  // authStep: "loading" | "passcode" | "personal" | "register" | "forgot" | "otp" | "resetpw" | "app"
  const [authStep,        setAuthStep]        = useState("loading");
  const [username,        setUsername]        = useState("");
  const [passcodeInput,   setPasscodeInput]   = useState("");
  const [passcodeErr,     setPasscodeErr]     = useState("");
  const [usernameInput,   setUsernameInput]   = useState("");
  const [personalPwInput, setPersonalPwInput] = useState("");
  const [personalErr,     setPersonalErr]     = useState("");
  const [personalLoading, setPersonalLoading] = useState(false);
  // registration flow
  const [regUser,         setRegUser]         = useState("");
  const [regPass,         setRegPass]         = useState("");
  const [regPassConf,     setRegPassConf]     = useState("");
  const [regEmail,        setRegEmail]        = useState("");
  const [regErr,          setRegErr]          = useState("");
  const [regLoading,      setRegLoading]      = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false); // fetched from Firestore
  const [appShowAcStats,    setAppShowAcStats]    = useState(true);  // fetched from Firestore
  const [appShowRouteStats, setAppShowRouteStats] = useState(true);  // fetched from Firestore
  // forgot-password flow
  const [forgotUser,      setForgotUser]      = useState("");
  const [forgotErr,       setForgotErr]       = useState("");
  const [forgotLoading,   setForgotLoading]   = useState(false);
  const [otpInput,        setOtpInput]        = useState("");
  const [otpErr,          setOtpErr]          = useState("");
  const [resetPwInput,    setResetPwInput]    = useState("");
  const [resetPwConfirm,  setResetPwConfirm]  = useState("");
  const [resetPwErr,      setResetPwErr]      = useState("");
  const [resetPwLoading,  setResetPwLoading]  = useState(false);
  const [otpTargetUser,   setOtpTargetUser]   = useState(""); // username going through reset

  // ── §13.3  Shared data (synced to Firestore for all users) ────────────────
  const [crew,   setCrew]   = useState([]);
  const [routes, setRoutes] = useState([]);

  // ── §13.4  Private data (synced per-user) ─────────────────────────────────
  const [flights, setFlights] = useState([]);

  // ── §13.5  Sync state ─────────────────────────────────────────────────────
  const [ready,      setReady]      = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");

  /**
   * Guard refs prevent write-back loops:
   * When Firestore pushes a snapshot, we set the ref = true BEFORE updating state.
   * The write useEffect skips the setDoc call if the ref is true, then clears it.
   */
  const isRemoteShared  = useRef(false);
  const isRemoteFlights = useRef(false);

  // ── §13.6  View routing ───────────────────────────────────────────────────
  const [view,      setView]      = useState("dashboard");
  const [profileId, setProfileId] = useState(null);  // active crew profile

  // ── §13.7  QuickLog form state ────────────────────────────────────────────
  const [qlInitialForm,  setQlInitialForm]  = useState({ ...EMPTY_FORM, date: today() });
  const [qlEditFlightId, setQlEditFlightId] = useState(null); // null = new, string = editing
  const [qlReturnView,   setQlReturnView]   = useState("dashboard"); // where to go after save

  // ── §13.8  Dashboard UI state ─────────────────────────────────────────────
  const [search,    setSearch]    = useState("");
  const [filterTag, setFilterTag] = useState(null);
  const [sortMode,  setSortMode]  = useState("alpha"); // "alpha" | "recent"

  // ── §13.9  Profile inline edit state ──────────────────────────────────────
  const [newCrew,        setNewCrew]        = useState({ id: "", name: "", nickname: "", seniority: "" });
  const [addCrewErr,     setAddCrewErr]     = useState("");
  const [editCrewInfo,   setEditCrewInfo]   = useState(false);
  const [tempCrewInfo,   setTempCrewInfo]   = useState({ name: "", nickname: "", seniority: "" });
  const [editNotes,      setEditNotes]      = useState(false);
  const [tempNotes,      setTempNotes]      = useState("");
  const [confirmDel,     setConfirmDel]     = useState(null);  // flight id pending delete
  const [confirmDelCrew, setConfirmDelCrew] = useState(false);

  // ── §13.10  User preferences (persisted to localStorage) ──────────────────
  const [customTags, setCustomTags] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cl-customTags") || "[]"); } catch { return []; }
  });
  const [defaultAircraft, setDefaultAircraft] = useState(() => localStorage.getItem("cl-defaultAC")  || "");
  const [defaultPosition, setDefaultPosition] = useState(() => localStorage.getItem("cl-defaultPos") || "");

  /** Combined tag list used everywhere tags are shown. */
  const allTags = [...PRESET_TAGS, ...customTags];


  // ─────────────────────────────────────────────────────────────────────────
  // §14  PERSISTENCE EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => { localStorage.setItem("cl-theme",      themeKey);                          }, [themeKey]);
  useEffect(() => { localStorage.setItem("cl-font",       fontKey);                           }, [fontKey]);
  useEffect(() => { localStorage.setItem("cl-customTags", JSON.stringify(customTags));      }, [customTags]);
  useEffect(() => { localStorage.setItem("cl-defaultAC",  defaultAircraft);                 }, [defaultAircraft]);
  useEffect(() => { localStorage.setItem("cl-defaultPos", defaultPosition);                 }, [defaultPosition]);


  // ─────────────────────────────────────────────────────────────────────────
  // §15  AUTH BOOTSTRAP
  // Reads localStorage on mount to determine which auth screen to show.
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const layer1 = localStorage.getItem("cl-auth");
    const layer2 = localStorage.getItem("cl-auth2");
    const saved  = localStorage.getItem("cl-username");
    // Fetch registration toggle + stats flags in parallel (non-blocking)
    getDoc(APP_SETTINGS_DOC).then(snap => {
      if (snap.exists()) {
        const s = snap.data();
        setRegistrationOpen(s.registrationOpen === true);
        setAppShowAcStats(s.showAcStats    !== false);
        setAppShowRouteStats(s.showRouteStats !== false);
      }
    }).catch(() => {});
    if (layer1 === "ok" && layer2 === "ok" && saved) { setUsername(saved); setAuthStep("app"); }
    else if (layer1 === "ok")                         { setAuthStep("personal"); }
    else                                              { setAuthStep("passcode"); }
  }, []);


  // ─────────────────────────────────────────────────────────────────────────
  // §16  FIRESTORE LISTENERS
  // Each listener sets its guard ref to true before updating state so the
  // corresponding write effect knows not to immediately write back.
  // ─────────────────────────────────────────────────────────────────────────

  // Shared doc — crew[] and routes[] (visible to all users)
  useEffect(() => {
    if (authStep !== "app") return;
    const unsub = onSnapshot(
      SHARED_DOC,
      (snap) => {
        isRemoteShared.current = true;
        if (snap.exists()) { const d = snap.data(); setCrew(d.crew || INITIAL_CREW); setRoutes(d.routes || []); }
        else               { setCrew(INITIAL_CREW); setRoutes([]); }
        setSyncStatus("synced");
        setReady(true);
      },
      () => { setSyncStatus("error"); setReady(true); }
    );
    return () => unsub();
  }, [authStep]);

  // Private doc — flights[] (visible only to this user)
  useEffect(() => {
    if (authStep !== "app" || !username) return;
    const unsub = onSnapshot(
      flightDoc(username),
      (snap) => {
        isRemoteFlights.current = true;
        setFlights(snap.exists() ? (snap.data().flights || []) : []);
      },
      () => {}
    );
    return () => unsub();
  }, [authStep, username]);


  // ─────────────────────────────────────────────────────────────────────────
  // §17  FIRESTORE WRITE EFFECTS
  // Only fire when state changes originate locally (guard refs are false).
  // ─────────────────────────────────────────────────────────────────────────

  // Write shared doc when crew or routes change locally
  useEffect(() => {
    if (!ready || authStep !== "app") return;
    if (isRemoteShared.current) { isRemoteShared.current = false; return; }
    setDoc(SHARED_DOC, { crew, routes }).catch(() => setSyncStatus("error"));
  }, [crew, routes, ready, authStep]);

  // Write private doc when flights change locally
  useEffect(() => {
    if (!ready || authStep !== "app" || !username) return;
    if (isRemoteFlights.current) { isRemoteFlights.current = false; return; }
    setDoc(flightDoc(username), { flights }).catch(() => setSyncStatus("error"));
  }, [flights, ready, authStep, username]);


  // ─────────────────────────────────────────────────────────────────────────
  // §18  AUTH HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Records a login event to USAGE_DOC.
   * Only stores: joinedAt (first time), lastLogin, flightCount.
   * Passwords and flight contents are NEVER written here.
   */
  const recordLogin = async (uname) => {
    try {
      const snap  = await getDoc(USAGE_DOC);
      const usage = snap.exists() ? (snap.data().usage || {}) : {};
      const now   = new Date().toISOString();
      const prev  = usage[uname] || {};
      await setDoc(USAGE_DOC, {
        usage: {
          ...usage,
          [uname]: {
            joinedAt:    prev.joinedAt    || now,
            lastLogin:   now,
            flightCount: prev.flightCount || 0,
          },
        },
      });
    } catch { /* non-critical — don't block login */ }
  };

  /** Layer 1 — shared passcode check */
  const submitPasscode = () => {
    if (passcodeInput === APP_PASSCODE) {
      localStorage.setItem("cl-auth", "ok");
      setPasscodeErr("");
      setPasscodeInput("");
      setAuthStep("personal");
    } else {
      setPasscodeErr("密碼錯誤 Wrong passcode ✈");
      setPasscodeInput("");
    }
  };

  /**
   * Layer 2 — personal username + password check against Firestore.
   * Accounts structure: { [username]: { password: string, email: string } }
   * First-ever boot uses "adminsetup" to seed the accounts document.
   */
  const submitPersonal = async () => {
    const uname = usernameInput.trim();
    if (!uname)           { setPersonalErr("請輸入用戶名 Enter username"); return; }
    if (!personalPwInput) { setPersonalErr("請輸入密碼 Enter password");   return; }

    setPersonalLoading(true);
    setPersonalErr("");
    try {
      const snap     = await getDoc(ACCOUNTS_DOC);
      const accounts = snap.exists() ? (snap.data().accounts || {}) : {};

      // ── First-ever boot: seed admin account ──────────────────────────────
      if (Object.keys(accounts).length === 0 && uname === "adminsetup") {
        const seeded = { adminsetup: { password: personalPwInput, email: "" } };
        await setDoc(ACCOUNTS_DOC, { accounts: seeded });
        localStorage.setItem("cl-auth2", "ok");
        localStorage.setItem("cl-username", uname);
        setUsername(uname);
        await recordLogin(uname);
        setAuthStep("app");
        return;
      }

      // ── Normal login ──────────────────────────────────────────────────────
      if (!accounts[uname]) {
        setPersonalErr("找不到帳號 Account not found");
        return;
      }
      const storedPw = typeof accounts[uname] === "object"
        ? accounts[uname].password
        : accounts[uname]; // backwards compat with old plain-string format
      if (storedPw !== personalPwInput) {
        setPersonalErr("密碼錯誤 Wrong password ✈");
        setPersonalPwInput("");
        return;
      }

      localStorage.setItem("cl-auth2", "ok");
      localStorage.setItem("cl-username", uname);
      setUsername(uname);
      await recordLogin(uname);
      setAuthStep("app");
    } catch {
      setPersonalErr("連線失敗 Connection error — try again");
    } finally {
      setPersonalLoading(false);
    }
  };

  /**
   * Self-registration — only allowed when admin has toggled registrationOpen = true.
   * Creates a new account in ACCOUNTS_DOC. Username must be unique.
   * Existing flight data (e.g. flights-Sophie) connects automatically by matching username.
   */
  const submitRegister = async () => {
    const uname = regUser.trim();
    const pass  = regPass.trim();
    const email = regEmail.trim();
    if (!uname)          { setRegErr("請輸入用戶名 Enter username");      return; }
    if (uname.length > 20) { setRegErr("用戶名太長 Username too long");  return; }
    if (!pass)           { setRegErr("請輸入密碼 Enter password");         return; }
    if (pass.length < 6) { setRegErr("密碼至少 6 位 Min 6 characters");   return; }
    if (pass !== regPassConf) { setRegErr("密碼不一致 Passwords don't match"); return; }
    if (!email)          { setRegErr("請輸入電郵 Enter email");            return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setRegErr("電郵格式錯誤 Invalid email"); return; }
    if (uname === "adminsetup") { setRegErr("此用戶名不可用 Username not allowed"); return; }

    setRegLoading(true);
    setRegErr("");
    try {
      const snap     = await getDoc(ACCOUNTS_DOC);
      const accounts = snap.exists() ? (snap.data().accounts || {}) : {};
      const normalised = Object.fromEntries(
        Object.entries(accounts).map(([k, v]) => [k, typeof v === "object" ? v : { password: v, email: "" }])
      );
      if (normalised[uname]) { setRegErr(`"${uname}" 已被使用 Username already taken — choose another`); return; }

      const updated = { ...normalised, [uname]: { password: pass, email } };
      await setDoc(ACCOUNTS_DOC, { accounts: updated });
      localStorage.setItem("cl-auth2", "ok");
      localStorage.setItem("cl-username", uname);
      setUsername(uname);
      await recordLogin(uname);
      setAuthStep("app");
    } catch {
      setRegErr("連線失敗 Connection error — try again");
    } finally {
      setRegLoading(false);
    }
  };

  /**
   * Forgot password — Step 1: look up account, generate OTP, send email via EmailJS.
   * OTP stored in Firestore under RESETS_DOC with 15-min expiry.
   */
  const submitForgot = async () => {
    const uname = forgotUser.trim();
    if (!uname) { setForgotErr("請輸入用戶名 Enter username"); return; }

    setForgotLoading(true);
    setForgotErr("");
    try {
      const snap     = await getDoc(ACCOUNTS_DOC);
      const accounts = snap.exists() ? (snap.data().accounts || {}) : {};
      if (!accounts[uname]) { setForgotErr("找不到帳號 Account not found"); return; }

      const acct  = typeof accounts[uname] === "object" ? accounts[uname] : { password: accounts[uname], email: "" };
      const email = acct.email || "";
      if (!email) { setForgotErr("此帳號未設定電郵 No email on file — contact admin"); return; }

      // Generate 6-digit OTP and store with expiry
      const code   = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = Date.now() + OTP_EXPIRY_MS;
      const resSnap  = await getDoc(RESETS_DOC);
      const resets   = resSnap.exists() ? (resSnap.data().resets || {}) : {};
      await setDoc(RESETS_DOC, { resets: { ...resets, [uname]: { code, expiry } } });

      // DEBUG: Log what we're sending
      console.log("🔐 Password Reset Debug:");
      console.log("→ Username:", uname);
      console.log("→ Email:", email);
      console.log("→ OTP Code:", code);
      console.log("→ Template ID:", EMAILJS_TEMPLATE_ID);

      const emailPayload = {
        service_id:  EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id:     EMAILJS_PUBLIC_KEY,
        template_params: { 
          to_email: email, 
          username: uname, 
          otp_code: code,
          from_name: "CrewLog Team",
          from_email: "noreply@crewlog.app",
          reply_to: "noreply@crewlog.app"
        },
      };
      console.log("→ Full payload:", JSON.stringify(emailPayload, null, 2));

      // Send email via EmailJS REST API
      const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(emailPayload),
      });

      console.log("→ EmailJS Response Status:", response.status);
      const responseText = await response.text();
      console.log("→ EmailJS Response:", responseText);

      if (!response.ok) {
        throw new Error(`EmailJS failed: ${response.status} ${responseText}`);
      }

      setOtpTargetUser(uname);
      setAuthStep("otp");
    } catch (err) {
      setForgotErr("發送失敗 Failed to send — check EmailJS config");
      console.error(err);
    } finally {
      setForgotLoading(false);
    }
  };

  /**
   * Forgot password — Step 2: validate OTP code.
   */
  const submitOtp = async () => {
    if (!otpInput.trim()) { setOtpErr("請輸入驗證碼 Enter the code"); return; }
    setOtpErr("");
    try {
      const snap   = await getDoc(RESETS_DOC);
      const resets = snap.exists() ? (snap.data().resets || {}) : {};
      const entry  = resets[otpTargetUser];
      if (!entry)                    { setOtpErr("驗證碼不存在 Code not found"); return; }
      if (Date.now() > entry.expiry) { setOtpErr("驗證碼已過期 Code expired — request a new one"); return; }
      if (otpInput.trim() !== entry.code) { setOtpErr("驗證碼錯誤 Wrong code"); return; }
      setAuthStep("resetpw");
    } catch {
      setOtpErr("連線失敗 Connection error");
    }
  };

  /**
   * Forgot password — Step 3: set new password.
   */
  const submitResetPw = async () => {
    if (!resetPwInput)                        { setResetPwErr("請輸入新密碼");          return; }
    if (resetPwInput.length < 6)              { setResetPwErr("密碼至少 6 位 Min 6 chars"); return; }
    if (resetPwInput !== resetPwConfirm)      { setResetPwErr("密碼不一致 Passwords don't match"); return; }

    setResetPwLoading(true);
    setResetPwErr("");
    try {
      // Update password in accounts
      const snap     = await getDoc(ACCOUNTS_DOC);
      const accounts = snap.exists() ? (snap.data().accounts || {}) : {};
      const acct     = typeof accounts[otpTargetUser] === "object"
        ? accounts[otpTargetUser]
        : { password: accounts[otpTargetUser], email: "" };
      const updated  = { ...accounts, [otpTargetUser]: { ...acct, password: resetPwInput } };
      await setDoc(ACCOUNTS_DOC, { accounts: updated });

      // Clear the OTP
      const resSnap = await getDoc(RESETS_DOC);
      const resets  = resSnap.exists() ? (resSnap.data().resets || {}) : {};
      const { [otpTargetUser]: _, ...remaining } = resets;
      await setDoc(RESETS_DOC, { resets: remaining });

      // Auto-login
      localStorage.setItem("cl-auth2", "ok");
      localStorage.setItem("cl-username", otpTargetUser);
      setUsername(otpTargetUser);
      setOtpInput(""); setResetPwInput(""); setResetPwConfirm(""); setOtpTargetUser("");
      setAuthStep("app");
    } catch {
      setResetPwErr("連線失敗 Connection error");
    } finally {
      setResetPwLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("cl-auth");
    localStorage.removeItem("cl-auth2");
    localStorage.removeItem("cl-username");
    setUsername(""); setPasscodeInput(""); setUsernameInput(""); setPersonalPwInput("");
    setForgotUser(""); setOtpInput(""); setResetPwInput(""); setResetPwConfirm("");
    setAuthStep("passcode");
    setReady(false); setCrew([]); setFlights([]); setRoutes([]);
  };


  // ─────────────────────────────────────────────────────────────────────────
  // §19  DATA HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Downloads all app data as a JSON backup file. */
  const exportJSON = () => {
    const data = { crew, flights, routes, customTags, exportedAt: new Date().toISOString() };
    const blob  = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url; a.download = `cabinlog-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  /** Merges an imported JSON backup into local state. */
  const handleImport = useCallback((data) => {
    if (data.crew        && Array.isArray(data.crew))       setCrew(data.crew);
    if (data.routes      && Array.isArray(data.routes))     setRoutes(data.routes);
    if (Array.isArray(data.flights))                        setFlights(data.flights);
    if (Array.isArray(data.customTags))                     setCustomTags(data.customTags);
  }, []);


  // ─────────────────────────────────────────────────────────────────────────
  // §20  CREW MUTATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Merges a partial patch object into a crew member. */
  const patchCrew = (id, patch) =>
    setCrew(cr => cr.map(m => m.id === id ? { ...m, ...patch } : m));

  /** Toggles a tag on a crew member (adds if absent, removes if present). */
  const flipTag = (id, tag) =>
    setCrew(cr => cr.map(m => {
      if (m.id !== id) return m;
      return { ...m, tags: m.tags.includes(tag) ? m.tags.filter(t => t !== tag) : [...m.tags, tag] };
    }));

  /** Removes a crew member from the shared list and deletes their flight entries. */
  const deleteCrew = (id) => {
    setCrew(cr => cr.filter(m => m.id !== id));
    setFlights(fl => fl.filter(f => f.crewId !== id));
    setConfirmDelCrew(false);
    setView("dashboard");
  };


  // ─────────────────────────────────────────────────────────────────────────
  // §21  NAVIGATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Navigate to a crew member's profile, resetting all inline edit state. */
  const goProfile = (id) => {
    setProfileId(id);
    setEditNotes(false);
    setConfirmDel(null);
    setConfirmDelCrew(false);
    setView("profile");
  };

  /**
   * Open the QuickLog form.
   * @param {string|null} crewId       — pre-select a crew member (new log)
   * @param {Object|null} flightToEdit — existing flight entry to edit
   */
  const openQL = (crewId = null, flightToEdit = null, returnView = null) => {
    if (flightToEdit) {
      // Editing an existing log — populate all fields, lock crew selector
      const m = crew.find(x => x.id === flightToEdit.crewId);
      setQlInitialForm({
        crewId:    flightToEdit.crewId,
        crewTxt:   m ? `${m.nickname} — ${m.name}` : "",
        date:      flightToEdit.date,
        flightNum: flightToEdit.flightNum  || "",
        route:     flightToEdit.route      || "",
        aircraft:  flightToEdit.aircraft   || "",
        position:  flightToEdit.position   || "",
        memo:      flightToEdit.memo       || "",
        status:    null,
        tags:      [],
      });
      setQlEditFlightId(flightToEdit.id);
    } else {
      // New log — pre-fill defaults and optionally pre-select a crew member
      const f = { ...EMPTY_FORM, date: today(), aircraft: defaultAircraft, position: defaultPosition };
      if (crewId) {
        const m = crew.find(x => x.id === crewId);
        if (m) { f.crewId = m.id; f.crewTxt = `${m.nickname} — ${m.name}`; f.status = m.status; f.tags = [...m.tags]; }
      }
      setQlInitialForm(f);
      setQlEditFlightId(null);
    }
    setQlReturnView(returnView || "dashboard");
    setView("quicklog");
  };

  /**
   * Called by QuickLogView on submit.
   * For new logs: also patches the crew member's status and tags.
   * For edits: only updates flight metadata fields.
   */
  const handleSaveLog = (form) => {
    if (!form.crewId || !form.date) return;

    const entry = {
      id:        qlEditFlightId || mkId(),
      crewId:    form.crewId,
      date:      form.date,
      flightNum: form.flightNum,
      route:     form.route,
      aircraft:  form.aircraft,
      position:  form.position,
      memo:      form.memo,
    };

    if (qlEditFlightId) {
      // Update existing flight — count stays the same
      setFlights(fl => fl.map(f => f.id === qlEditFlightId ? entry : f));
    } else {
      // Add new flight and propagate status/tags to the crew member
      setFlights(fl => {
        const next = [...fl, entry];
        // Update flight count in usage tracker (count only, no content)
        getDoc(USAGE_DOC).then(snap => {
          const usage = snap.exists() ? (snap.data().usage || {}) : {};
          const prev  = usage[username] || {};
          setDoc(USAGE_DOC, { usage: { ...usage, [username]: { ...prev, flightCount: next.length } } }).catch(() => {});
        }).catch(() => {});
        return next;
      });
      setCrew(cr => cr.map(m => {
        if (m.id !== form.crewId) return m;
        return {
          ...m,
          status: form.status ?? m.status,
          tags:   [...new Set([...m.tags, ...form.tags])],
        };
      }));
    }

    setQlEditFlightId(null);
    // Return to the view we came from
    setView(qlReturnView);
  };


  // ─────────────────────────────────────────────────────────────────────────
  // §22  DERIVED DATA
  // ─────────────────────────────────────────────────────────────────────────

  /** Map of crewId → most recent flight date string (used for "recent" sort). */
  const lastFlownMap = {};
  flights.forEach(f => {
    if (!lastFlownMap[f.crewId] || f.date > lastFlownMap[f.crewId]) lastFlownMap[f.crewId] = f.date;
  });

  /** Top 3 recently-flown crew IDs (unique), shown in the dashboard recent strip. */
  const recentIds = [
    ...new Set([...flights].sort((a, b) => new Date(b.date) - new Date(a.date)).map(f => f.crewId))
  ].slice(0, 3);

  /**
   * Filtered & sorted crew list for the dashboard.
   * Search matches: id, name, nickname, or memo text (if query length > 1).
   */
  const filtered = crew
    .filter(m => {
      const q         = search.toLowerCase();
      const memoMatch = search.length > 1 && flights.filter(f => f.crewId === m.id).some(f => (f.memo || "").toLowerCase().includes(q));
      const basic     = !q || m.id.includes(q) || m.name.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q) || memoMatch;
      return basic && (!filterTag || m.tags.includes(filterTag));
    })
    .sort((a, b) => {
      if (sortMode === "recent") {
        const la = lastFlownMap[a.id] || "0000";
        const lb = lastFlownMap[b.id] || "0000";
        return lb.localeCompare(la);
      }
      return a.nickname.localeCompare(b.nickname, "ja");
    });

  /** Active profile crew member and their flight history. */
  const pMember  = crew.find(m => m.id === profileId);
  const pFlights = flights.filter(f => f.crewId === profileId).sort((a, b) => new Date(b.date) - new Date(a.date));

  /** Shared input style used in inline form fields throughout the app. */
  const inp = {
    background:   c.input,
    border:       `1px solid ${c.border}`,
    borderRadius: 12,
    padding:      "11px 14px",
    color:        c.text,
    fontSize:     14,
    fontFamily:   "inherit",
    outline:      "none",
    width:        "100%",
  };


  // ─────────────────────────────────────────────────────────────────────────
  // §23  AUTH SCREENS
  // These render before the main app shell is mounted.
  // ─────────────────────────────────────────────────────────────────────────

  if (authStep === "loading") return (
    <>
      <style>{gs}</style>
      <div style={{ background: "#0B0C14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#F5B731", fontSize: 20, letterSpacing: 4, fontFamily: "'Syne',sans-serif" }}>✈ LOADING...</span>
      </div>
    </>
  );

  if (authStep === "passcode") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Logo + branding */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/logo.png" alt="CrewLog" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: 12, borderRadius: 18 }} />
          <div style={{ fontSize: 9, letterSpacing: 5, color: c.accent, fontWeight: 700, marginBottom: 6 }}>CREW LOG</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.text, lineHeight: 1.2 }}>我的天空日記</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8 }}>Enter crew passcode to continue</div>
        </div>
        {/* Layer 1 card */}
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>🔐</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: c.text }}>Step 1 of 2</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: c.sub }}>CREW PASSCODE</div>
            </div>
          </div>
          <ClearableInput
            type="password"
            value={passcodeInput}
            onChange={e => { setPasscodeInput(e.target.value); setPasscodeErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitPasscode()}
            placeholder="••••••••"
            autoFocus
            style={{ ...inp, marginBottom: passcodeErr ? 8 : 16, fontSize: 20, letterSpacing: 6, textAlign: "center" }}
            c={c}
          />
          {passcodeErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{passcodeErr}</div>}
          <button
            onClick={submitPasscode}
            style={{ width: "100%", background: c.accent, color: c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}
          >
            繼續 NEXT →
          </button>
        </div>
      </div>
    </div>
  );

  if (authStep === "personal") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/logo.png" alt="CrewLog" style={{ width: 80, height: 80, objectFit: "contain", marginBottom: 12, borderRadius: 18 }} />
          <div style={{ fontSize: 9, letterSpacing: 5, color: c.accent, fontWeight: 700, marginBottom: 6 }}>CREW LOG</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: c.text, lineHeight: 1.2 }}>我的天空日記</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8 }}>Sign in to your personal account</div>
        </div>
        {/* Layer 2 card */}
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 18 }}>👤</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: c.text }}>Step 2 of 2</div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: c.sub }}>PERSONAL LOGIN</div>
            </div>
          </div>

          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>用戶名 USERNAME</div>
          <ClearableInput
            value={usernameInput}
            onChange={e => { setUsernameInput(e.target.value); setPersonalErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitPersonal()}
            placeholder="Username"
            autoComplete="username"
            autoFocus
            style={{ ...inp, marginBottom: 16, fontSize: 16, textAlign: "center" }}
            c={c}
          />

          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>密碼 PASSWORD</div>
          <ClearableInput
            type="password"
            value={personalPwInput}
            onChange={e => { setPersonalPwInput(e.target.value); setPersonalErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitPersonal()}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ ...inp, marginBottom: personalErr ? 8 : 20, fontSize: 20, letterSpacing: 6, textAlign: "center" }}
            c={c}
          />
          {personalErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{personalErr}</div>}

          <button
            onClick={submitPersonal}
            disabled={personalLoading}
            style={{ width: "100%", background: personalLoading ? c.pill : c.accent, color: personalLoading ? c.sub : c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: personalLoading ? "default" : "pointer", fontFamily: "inherit", letterSpacing: 1 }}
          >
            {personalLoading ? "確認中..." : "進入 ENTER ✈"}
          </button>

          {/* Forgot password link */}
          <button
            onClick={() => { setForgotUser(usernameInput); setForgotErr(""); setAuthStep("forgot"); }}
            style={{ width: "100%", background: "none", border: "none", color: c.accent, cursor: "pointer", fontSize: 12, marginTop: 14, fontFamily: "inherit", fontWeight: 700 }}
          >
            忘記密碼？ Forgot password?
          </button>

          {/* Create account — only shown when admin enables registration */}
          {registrationOpen ? (
            <button
              onClick={() => { setRegUser(""); setRegPass(""); setRegPassConf(""); setRegEmail(""); setRegErr(""); setAuthStep("register"); }}
              style={{ width: "100%", background: "none", border: `1px solid ${c.border}`, borderRadius: 10, color: c.text, cursor: "pointer", fontSize: 13, marginTop: 10, fontFamily: "inherit", fontWeight: 700, padding: "10px" }}
            >
              ✨ 建立帳號 Create Account
            </button>
          ) : (
            <div style={{ textAlign: "center", fontSize: 11, color: c.sub, marginTop: 12, opacity: 0.6 }}>
              註冊暫未開放 Registration currently not available
            </div>
          )}

          {/* Back to layer 1 */}
          <button
            onClick={() => { localStorage.removeItem("cl-auth"); setAuthStep("passcode"); setPersonalErr(""); }}
            style={{ width: "100%", background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 12, marginTop: 6, fontFamily: "inherit" }}
          >
            ← 返回 Back
          </button>
        </div>
      </div>
    </div>
  );

  // ── Create Account screen ───────────────────────────────────────────────
  if (authStep === "register") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="CrewLog" style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 12, borderRadius: 16 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>建立帳號</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8, lineHeight: 1.6 }}>
            Create your personal CrewLog account.<br />
            <span style={{ color: c.accent, fontWeight: 700 }}>Your flight logs are private to you only.</span>
          </div>
        </div>
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>

          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>用戶名 USERNAME</div>
          <ClearableInput
            value={regUser}
            onChange={e => { setRegUser(e.target.value); setRegErr(""); }}
            placeholder="Choose a username"
            autoFocus
            autoComplete="off"
            style={{ ...inp, marginBottom: 14, fontSize: 15, textAlign: "center" }}
            c={c}
          />

          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>密碼 PASSWORD</div>
          <ClearableInput
            type="password"
            value={regPass}
            onChange={e => { setRegPass(e.target.value); setRegErr(""); }}
            placeholder="Min 6 characters"
            autoComplete="new-password"
            style={{ ...inp, marginBottom: 8, fontSize: 16, letterSpacing: 4, textAlign: "center" }}
            c={c}
          />
          <ClearableInput
            type="password"
            value={regPassConf}
            onChange={e => { setRegPassConf(e.target.value); setRegErr(""); }}
            placeholder="Confirm password"
            autoComplete="new-password"
            style={{ ...inp, marginBottom: 14, fontSize: 16, letterSpacing: 4, textAlign: "center" }}
            c={c}
          />

          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>電郵 EMAIL <span style={{ fontWeight: 400, opacity: 0.6 }}>for password reset</span></div>
          <ClearableInput
            value={regEmail}
            onChange={e => { setRegEmail(e.target.value); setRegErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitRegister()}
            placeholder="your@email.com"
            type="email"
            autoComplete="email"
            style={{ ...inp, marginBottom: regErr ? 8 : 18, fontSize: 14, textAlign: "center" }}
            c={c}
          />
          {regErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{regErr}</div>}

          <button
            onClick={submitRegister}
            disabled={regLoading}
            style={{ width: "100%", background: regLoading ? c.pill : c.accent, color: regLoading ? c.sub : c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: regLoading ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {regLoading ? "建立中..." : "✨ 建立帳號 Create Account"}
          </button>
          <button
            onClick={() => { setRegErr(""); setAuthStep("personal"); }}
            style={{ width: "100%", background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 12, marginTop: 12, fontFamily: "inherit" }}
          >
            ← 返回登入 Back to login
          </button>
        </div>
      </div>
    </div>
  );

  // ── Forgot password — Step 1: enter username ────────────────────────────
  if (authStep === "forgot") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>忘記密碼</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8, lineHeight: 1.6 }}>
            Enter your username and we'll send<br />a 6-digit reset code to your email.
          </div>
        </div>
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>用戶名 USERNAME</div>
          <ClearableInput
            value={forgotUser}
            onChange={e => { setForgotUser(e.target.value); setForgotErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitForgot()}
            placeholder="Username"
            autoFocus
            style={{ ...inp, marginBottom: forgotErr ? 8 : 16, fontSize: 16, textAlign: "center" }}
            c={c}
          />
          {forgotErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{forgotErr}</div>}
          <button
            onClick={submitForgot}
            disabled={forgotLoading}
            style={{ width: "100%", background: forgotLoading ? c.pill : c.accent, color: forgotLoading ? c.sub : c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: forgotLoading ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {forgotLoading ? "發送中..." : "發送驗證碼 Send Code ✉"}
          </button>
          <button
            onClick={() => { setForgotErr(""); setAuthStep("personal"); }}
            style={{ width: "100%", background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 12, marginTop: 12, fontFamily: "inherit" }}
          >
            ← 返回登入 Back to login
          </button>
        </div>
      </div>
    </div>
  );

  // ── Forgot password — Step 2: enter OTP ────────────────────────────────
  if (authStep === "otp") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✉️</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>驗證碼已發送</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8, lineHeight: 1.6 }}>
            Check your email for a 6-digit code.<br />
            <span style={{ color: c.accent, fontWeight: 700 }}>Valid for 15 minutes.</span>
          </div>
        </div>
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>驗證碼 RESET CODE</div>
          <ClearableInput
            value={otpInput}
            onChange={e => { setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitOtp()}
            placeholder="000000"
            autoFocus
            inputMode="numeric"
            maxLength={6}
            style={{ ...inp, marginBottom: otpErr ? 8 : 16, fontSize: 28, letterSpacing: 8, textAlign: "center" }}
            c={c}
          />
          {otpErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{otpErr}</div>}
          <button
            onClick={submitOtp}
            style={{ width: "100%", background: c.accent, color: c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
          >
            確認 Verify →
          </button>
          <button
            onClick={() => { setOtpInput(""); setOtpErr(""); setAuthStep("forgot"); }}
            style={{ width: "100%", background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 12, marginTop: 12, fontFamily: "inherit" }}
          >
            ← 重新發送 Resend code
          </button>
        </div>
      </div>
    </div>
  );

  // ── Forgot password — Step 3: set new password ─────────────────────────
  if (authStep === "resetpw") return (
    <div style={{ background: c.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, overflowX: "hidden" }}>
      <style>{gs}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>設定新密碼</div>
          <div style={{ fontSize: 13, color: c.sub, marginTop: 8 }}>Choose a strong new password for<br /><strong style={{ color: c.accent }}>{otpTargetUser}</strong></div>
        </div>
        <div style={{ background: c.card, borderRadius: 20, padding: 24, border: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>新密碼 NEW PASSWORD</div>
          <ClearableInput
            type="password"
            value={resetPwInput}
            onChange={e => { setResetPwInput(e.target.value); setResetPwErr(""); }}
            placeholder="Min 6 characters"
            autoFocus
            style={{ ...inp, marginBottom: 14, fontSize: 18, letterSpacing: 4, textAlign: "center" }}
            c={c}
          />
          <div style={{ fontSize: 10, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>確認密碼 CONFIRM PASSWORD</div>
          <ClearableInput
            type="password"
            value={resetPwConfirm}
            onChange={e => { setResetPwConfirm(e.target.value); setResetPwErr(""); }}
            onKeyDown={e => e.key === "Enter" && submitResetPw()}
            placeholder="Repeat password"
            style={{ ...inp, marginBottom: resetPwErr ? 8 : 18, fontSize: 18, letterSpacing: 4, textAlign: "center" }}
            c={c}
          />
          {resetPwErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{resetPwErr}</div>}
          <button
            onClick={submitResetPw}
            disabled={resetPwLoading}
            style={{ width: "100%", background: resetPwLoading ? c.pill : c.accent, color: resetPwLoading ? c.sub : c.adk, border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 800, cursor: resetPwLoading ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {resetPwLoading ? "更新中..." : "儲存新密碼 Save & Login ✈"}
          </button>
        </div>
      </div>
    </div>
  );

  if (!ready) return (
    <>
      <style>{gs}</style>
      <div style={{ background: "#0B0C14", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ color: "#F5B731", fontSize: 20, letterSpacing: 4, fontFamily: "'Syne',sans-serif" }}>✈ LOADING...</span>
        <span style={{ color: "#6B7499", fontSize: 12, letterSpacing: 2 }}>連接雲端資料庫...</span>
      </div>
    </>
  );


  // ─────────────────────────────────────────────────────────────────────────
  // §24  DASHBOARD VIEW  (inline function — closure over App state)
  // Main crew list: search bar, tag filters, sort toggle, recent strip,
  // scrollable crew cards, add-crew form, and floating + button.
  // NOTE: Declared as a function (not a component) so it shares App's state.
  // ─────────────────────────────────────────────────────────────────────────
  const DashView = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ 
        padding: "calc(env(safe-area-inset-top) + 18px) 16px 12px", 
        background: c.card, 
        borderBottom: `1px solid ${c.border}`, 
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        {/* Top row: title only - buttons moved to bottom nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 4, color: c.accent, fontWeight: 700, marginBottom: 2 }}>CREW LOG ✈ 我的天空日記</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.text }}>Dashboard</div>
              <SyncBadge syncStatus={syncStatus} c={c} />
            </div>
          </div>
          {/* Light/Dark Mode Toggle */}
          <button
            onClick={() => setThemeKey(tk => tk.endsWith("Dark") ? tk.replace("Dark", "Light") : tk.replace("Light", "Dark"))}
            style={{
              background: c.pill,
              border: "none",
              color: c.text,
              cursor: "pointer",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </div>

        {/* User / logbook shortcut */}
        <div
          onClick={() => setView("mylog")}
          style={{ background: c.pill, borderRadius: 12, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>👤</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{username}</span>
            <span style={{ fontSize: 11, color: c.sub }}>· {flights.length} 筆</span>
          </div>
          <span style={{ fontSize: 11, color: c.accent, fontWeight: 700 }}>日記 ›</span>
        </div>

        {/* Search input */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: c.sub, zIndex: 1, pointerEvents: "none" }}>🔍</span>
          <ClearableInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ID / 姓名 / Nickname / 備忘..."
            autoComplete="off"
            autoCorrect="off"
            style={{ ...inp, paddingLeft: 36 }}
            c={c}
          />
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 16px 100px", WebkitOverflowScrolling: "touch" }}>

        {/* Tag filter strip + sort toggle */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <Tag on={!filterTag} onClick={() => setFilterTag(null)} c={c}>ALL</Tag>
          {allTags.map(t => (
            <Tag key={t} on={filterTag === t} onClick={() => setFilterTag(filterTag === t ? null : t)} c={c}>{t}</Tag>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button onClick={() => setSortMode("alpha")}  style={{ background: sortMode === "alpha"  ? c.accent : c.pill, color: sortMode === "alpha"  ? c.adk : c.sub, border: "none", borderRadius: 10, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>A–Z</button>
            <button onClick={() => setSortMode("recent")} style={{ background: sortMode === "recent" ? c.accent : c.pill, color: sortMode === "recent" ? c.adk : c.sub, border: "none", borderRadius: 10, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>最近</button>
          </div>
        </div>

        {/* Recent strip — hidden when searching or filtering */}
        {recentIds.length > 0 && !search && !filterTag && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>我的最近合飛 MY RECENT</div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}>
              {recentIds.map(id => {
                const m    = crew.find(x => x.id === id); if (!m) return null;
                const last = flights.filter(f => f.crewId === id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                const si   = m.status ? STATUS_MAP[m.status] : null;
                return (
                  <div
                    key={id}
                    onClick={() => goProfile(id)}
                    style={{ background: si ? si.bg : c.card, border: `1px solid ${si ? si.border : c.border}`, borderRadius: 14, padding: "10px 12px", minWidth: 115, flexShrink: 0, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <Dot status={m.status} sz={8} c={c} />
                      <span style={{ fontWeight: 800, fontSize: 15, color: c.text }}>{m.nickname}</span>
                    </div>
                    <div style={{ fontSize: 11, color: c.sub, marginBottom: 5 }}>{m.name}</div>
                    {last && <div style={{ fontSize: 11, color: c.accent, fontWeight: 600 }}>{last.date}</div>}
                    <button
                      onClick={e => { e.stopPropagation(); openQL(id); }}
                      style={{ marginTop: 5, background: c.accent, color: c.adk, border: "none", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      + 新增
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All Crew list */}
        <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 10 }}>
          全部組員 ALL CREW ({filtered.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(m => {
            const si        = m.status ? STATUS_MAP[m.status] : null;
            const last      = flights.filter(f => f.crewId === m.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const memoMatch = search.length > 1 && flights.filter(f => f.crewId === m.id).some(f => (f.memo || "").toLowerCase().includes(search.toLowerCase()));
            return (
              <div
                key={m.id}
                onClick={() => goProfile(m.id)}
                style={{
                  background:   si ? si.bg : c.card,
                  border:       `1px solid ${si ? si.border : c.border}`,
                  borderRadius: 14, padding: "12px 14px",
                  cursor:       "pointer", display: "flex", alignItems: "center", gap: 12,
                  outline:      memoMatch ? `2px solid ${c.accent}` : "none",
                }}
              >
                <Dot status={m.status} sz={12} c={c} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: c.text }}>{m.nickname}</span>
                    <span style={{ fontSize: 13, color: c.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                    <span style={{ fontSize: 10, color: c.accent, fontWeight: 700, marginLeft: "auto", flexShrink: 0 }}>{m.seniority}</span>
                  </div>
                  <div style={{ fontSize: 11, color: c.sub, marginBottom: m.tags.length ? 4 : 0 }}>
                    #{m.id}
                    {memoMatch && <span style={{ color: c.accent, marginLeft: 6 }}>📝 備忘符合</span>}
                  </div>
                  {m.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {m.tags.map(t => (
                        <span key={t} style={{ background: c.pill, color: c.sub, borderRadius: 10, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: last ? c.sub : c.border }}>{last ? last.date : "—"}</div>
                  <button
                    onClick={e => { e.stopPropagation(); openQL(m.id); }}
                    style={{ marginTop: 4, background: c.pill, color: c.accent, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new crew form */}
        <div style={{ marginTop: 24, background: c.card, border: `1px dashed ${c.border}`, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: c.accent, fontWeight: 700, marginBottom: 4 }}>新增組員 ADD CREW</div>
          <div style={{ fontSize: 10, color: c.sub, marginBottom: 12 }}>⚠ Shared with all users</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <ClearableInput value={newCrew.id}        onChange={e => setNewCrew(n => ({ ...n, id:        e.target.value }))} placeholder="員工 ID *"        autoComplete="off" style={{ ...inp, fontSize: 13, padding: "9px 12px" }} c={c} />
            <ClearableInput value={newCrew.nickname}  onChange={e => setNewCrew(n => ({ ...n, nickname:  e.target.value }))} placeholder="Nickname *"        autoComplete="off" style={{ ...inp, fontSize: 13, padding: "9px 12px" }} c={c} />
            <ClearableInput value={newCrew.name}      onChange={e => setNewCrew(n => ({ ...n, name:      e.target.value }))} placeholder="姓名 (中文/日文)" autoComplete="off" style={{ ...inp, fontSize: 13, padding: "9px 12px" }} c={c} />
            <ClearableInput value={newCrew.seniority} onChange={e => setNewCrew(n => ({ ...n, seniority: e.target.value }))} placeholder="期別 e.g. 24G"     autoComplete="off" style={{ ...inp, fontSize: 13, padding: "9px 12px" }} c={c} />
          </div>
          {addCrewErr && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 8 }}>{addCrewErr}</div>}
          <button
            onClick={() => {
              setAddCrewErr("");
              if (!newCrew.id.trim() || !newCrew.nickname.trim()) { setAddCrewErr("ID 和英文名為必填"); return; }
              if (crew.find(m => m.id === newCrew.id.trim()))     { setAddCrewErr("此 ID 已存在"); return; }
              const dupNick = crew.find(m => m.nickname.toLowerCase() === newCrew.nickname.trim().toLowerCase());
              if (dupNick) { setAddCrewErr(`"${newCrew.nickname}" 已有同名組員 (${dupNick.name} · ${dupNick.seniority})`); return; }
              setCrew(cr => [...cr, {
                id:        newCrew.id.trim(),
                name:      newCrew.name.trim(),
                nickname:  newCrew.nickname.trim(),
                seniority: newCrew.seniority.trim(),
                status:    null,
                tags:      [],
                notes:     "",
              }]);
              setNewCrew({ id: "", name: "", nickname: "", seniority: "" });
            }}
            style={{ width: "100%", background: c.accent, color: c.adk, border: "none", borderRadius: 12, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            + 新增 Add Member
          </button>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: 440,
        width: "100%",
        background: c.card,
        borderTop: `1px solid ${c.border}`,
        padding: "8px 16px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        zIndex: 100,
        boxShadow: `0 -2px 16px ${c.bg}CC`,
      }}>
        {/* My Log */}
        <button
          onClick={() => setView("mylog")}
          style={{
            background: "none",
            border: "none",
            color: c.sub,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "4px 12px",
          }}
        >
          <span style={{ fontSize: 22 }}>📖</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>日記</span>
        </button>

        {/* Add New (FAB - centered and elevated) */}
        <button
          onClick={() => openQL()}
          style={{
            background: c.accent,
            color: c.adk,
            border: "none",
            borderRadius: "50%",
            width: 56,
            height: 56,
            fontSize: 28,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: `0 4px 20px ${c.accent}88`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: -32,
          }}
        >
          +
        </button>

        {/* Settings */}
        <button
          onClick={() => setView("settings")}
          style={{
            background: "none",
            border: "none",
            color: c.sub,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "4px 12px",
          }}
        >
          <span style={{ fontSize: 22 }}>⚙</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>設定</span>
        </button>
      </div>
    </div>
  );


  // ─────────────────────────────────────────────────────────────────────────
  // §25  PROFILE VIEW  (inline function — closure over App state)
  // Shows a single crew member's status, tags, shared notes, and private
  // flight timeline. Supports inline editing of crew info and notes.
  // ─────────────────────────────────────────────────────────────────────────
  const ProfView = () => {
    if (!pMember) return null;
    const m  = pMember;
    const si = m.status ? STATUS_MAP[m.status] : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>

        {/* ── Profile header ── */}
        <div style={{ 
          padding: "max(16px, env(safe-area-inset-top)) 16px 14px", 
          background: si ? si.bg : c.card, 
          borderBottom: `2px solid ${si ? si.border : c.border}`, 
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setView("dashboard")} style={{ background: "rgba(128,128,128,0.15)", border: "none", color: c.text, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 18 }}>←</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => openQL(m.id)} style={{ background: c.accent, color: c.adk, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ 新增飛行</button>
          </div>

          {/* Status banner */}
          {si && (
            <div style={{ background: si.bg, border: `1px solid ${si.border}`, borderRadius: 10, padding: "7px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{si.emoji}</span>
              <span style={{ color: si.color, fontWeight: 800, fontSize: 13 }}>{si.label}</span>
            </div>
          )}

          {/* Avatar + name block */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 16, flexShrink: 0,
              background: si ? si.bg : c.pill, border: `2px solid ${si ? si.color : c.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 800, color: si ? si.color : c.accent,
            }}>
              {m.nickname[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.text, lineHeight: 1.1 }}>{m.nickname}</div>
              <div style={{ fontSize: 14, color: c.sub }}>{m.name}</div>
              <div style={{ fontSize: 11, color: c.accent, fontWeight: 700, marginTop: 2 }}>
                {m.seniority} · #{m.id} · {pFlights.length} 次 (我的)
              </div>
            </div>
          </div>

          {/* Status light toggles */}
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <button
                key={k}
                onClick={() => patchCrew(m.id, { status: m.status === k ? null : k })}
                style={{
                  flex: 1, background: m.status === k ? v.bg : c.pill,
                  border: `1px solid ${m.status === k ? v.color : c.border}`,
                  color: m.status === k ? v.color : c.sub,
                  borderRadius: 10, padding: "7px 4px", fontSize: 16, cursor: "pointer",
                }}
              >
                {v.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* ── Profile body ── */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 16px 100px", WebkitOverflowScrolling: "touch" }}>

          {/* Crew Info (shared — editable by anyone) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>組員資料 CREW INFO</span>
              <button
                onClick={() => {
                  if (editCrewInfo) {
                    if (tempCrewInfo.nickname.trim()) patchCrew(m.id, tempCrewInfo);
                    setEditCrewInfo(false);
                  } else {
                    setTempCrewInfo({ name: m.name, nickname: m.nickname, seniority: m.seniority });
                    setEditCrewInfo(true);
                  }
                }}
                style={{ background: "none", border: "none", color: c.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {editCrewInfo ? "💾 儲存" : "✏ 編輯"}
              </button>
            </div>
            {editCrewInfo ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ClearableInput value={tempCrewInfo.nickname}  onChange={e => setTempCrewInfo(t => ({ ...t, nickname:  e.target.value }))} placeholder="Nickname *"   autoComplete="off" style={{ ...inp, borderRadius: 12, padding: "10px 14px" }} c={c} />
                <ClearableInput value={tempCrewInfo.name}      onChange={e => setTempCrewInfo(t => ({ ...t, name:      e.target.value }))} placeholder="姓名"          autoComplete="off" style={{ ...inp, borderRadius: 12, padding: "10px 14px" }} c={c} />
                <ClearableInput value={tempCrewInfo.seniority} onChange={e => setTempCrewInfo(t => ({ ...t, seniority: e.target.value }))} placeholder="期別 e.g. 24G" autoComplete="off" style={{ ...inp, borderRadius: 12, padding: "10px 14px" }} c={c} />
              </div>
            ) : (
              <div style={{ background: c.cardAlt, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: c.sub, lineHeight: 1.8 }}>
                <span style={{ color: c.text, fontWeight: 700 }}>{m.nickname}</span> · {m.name}<br />
                期別 {m.seniority} · #{m.id}
              </div>
            )}
          </div>

          {/* Tags (shared) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8 }}>標籤 TAGS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allTags.map(t => (
                <button
                  key={t}
                  onClick={() => flipTag(m.id, t)}
                  style={{
                    background:   m.tags.includes(t) ? c.accent : c.pill,
                    color:        m.tags.includes(t) ? c.adk    : c.sub,
                    border:       "none", borderRadius: 20, padding: "6px 12px",
                    fontSize:     12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Long-term notes (shared) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>長期筆記 NOTES</span>
              <button
                onClick={() => {
                  if (editNotes) { patchCrew(m.id, { notes: tempNotes }); setEditNotes(false); }
                  else           { setTempNotes(m.notes); setEditNotes(true); }
                }}
                style={{ background: "none", border: "none", color: c.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {editNotes ? "💾 儲存" : "✏ 編輯"}
              </button>
            </div>
            {editNotes
              ? <ClearableTextarea value={tempNotes} onChange={e => setTempNotes(e.target.value)} rows={3} style={{ ...inp, resize: "vertical", border: `1px solid ${c.accent}`, borderRadius: 12 }} c={c} />
              : <div style={{ background: c.cardAlt, border: `1px solid ${c.border}`, borderRadius: 12, padding: "11px 14px", color: m.notes ? c.text : c.sub, fontSize: 14, minHeight: 48, lineHeight: 1.6 }}>
                  {m.notes || "尚無備忘。No notes yet."}
                </div>
            }
          </div>

          {/* Private flight history timeline */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: c.sub, fontWeight: 700, marginBottom: 14 }}>
              我的合飛紀錄 MY HISTORY ({pFlights.length}) <span style={{ fontWeight: 400, fontSize: 8 }}>🔒 only you</span>
            </div>

            {pFlights.length === 0 ? (
              <div style={{ textAlign: "center", color: c.sub, fontSize: 14, padding: "28px 0" }}>
                尚無紀錄<br />No flights logged yet
              </div>
            ) : (
              /* Vertical timeline */
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 15, top: 6, bottom: 6, width: 1, background: c.border }} />
                {pFlights.map(f => (
                  <div key={f.id} style={{ position: "relative", paddingLeft: 38, marginBottom: 14 }}>
                    {/* Timeline dot */}
                    <div style={{ position: "absolute", left: 9, top: 14, width: 13, height: 13, borderRadius: "50%", background: c.accent, border: `2px solid ${c.bg}` }} />

                    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 12px" }}>
                      {/* Flight header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                        <span style={{ fontWeight: 700, color: c.text, fontSize: 14 }}>
                          {f.flightNum || "—"}
                          {f.route && <span style={{ color: c.sub, fontSize: 12, fontWeight: 400, marginLeft: 8 }}>{f.route}</span>}
                        </span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 11, color: c.sub }}>{f.date}</span>
                          <button onClick={() => openQL(null, f)} style={{ background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✏</button>
                          {/* Delete with confirmation */}
                          {confirmDel === f.id ? (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => { setFlights(fl => fl.filter(x => x.id !== f.id)); setConfirmDel(null); }}
                                style={{ background: "#FF453A", color: "#fff", border: "none", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                              >
                                確認刪除
                              </button>
                              <button
                                onClick={() => setConfirmDel(null)}
                                style={{ background: c.pill, color: c.sub, border: "none", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDel(f.id)} style={{ background: "none", border: "none", color: "#FF453A", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>🗑</button>
                          )}
                        </div>
                      </div>

                      {/* Aircraft & position badges */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: f.memo ? 5 : 0 }}>
                        {f.aircraft && <span style={{ background: c.pill, color: c.accent, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{f.aircraft}</span>}
                        {f.position && <span style={{ background: c.pill, color: c.sub,    borderRadius: 8, padding: "2px 8px", fontSize: 11 }}>{f.position}</span>}
                      </div>

                      {/* Memo */}
                      {f.memo && <div style={{ fontSize: 13, color: c.sub, borderTop: `1px solid ${c.border}`, paddingTop: 5, marginTop: 2 }}>📝 {f.memo}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger zone — delete crew member */}
          <div style={{ marginTop: 32, borderTop: `1px solid ${c.border}`, paddingTop: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#FF453A", fontWeight: 700, marginBottom: 10 }}>危險區域 DANGER ZONE</div>
            {confirmDelCrew ? (
              <div style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.4)", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#FF453A", marginBottom: 6 }}>確定要刪除 {m.nickname}？</div>
                <div style={{ fontSize: 12, color: c.sub, marginBottom: 14 }}>
                  This removes them from the shared crew list for everyone. Your personal flight logs will also be deleted.<br />⚠ Cannot be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => deleteCrew(m.id)} style={{ flex: 1, background: "#FF453A", color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>確認刪除 DELETE</button>
                  <button onClick={() => setConfirmDelCrew(false)} style={{ flex: 1, background: c.pill, color: c.sub, border: "none", borderRadius: 10, padding: "11px", fontSize: 13, cursor: "pointer" }}>取消 Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelCrew(true)}
                style={{ width: "100%", background: "transparent", color: "#FF453A", border: "1px solid rgba(255,69,58,0.35)", borderRadius: 12, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                🗑 刪除此組員 Delete Crew Member
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };


  // ─────────────────────────────────────────────────────────────────────────
  // §26  MAIN RENDER
  // Injects global styles, applies the 440 px max-width shell,
  // and routes to the correct view based on the `view` state string.
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{gs}</style>
      <div style={{
        fontFamily:  font.family,
        background:  c.bg,
        color:       c.text,
        minHeight:   "100vh",
        maxWidth:    440,
        margin:      "0 auto",
        boxShadow:   "0 0 80px rgba(0,0,0,0.5)",
        overflowX:   "hidden",
        touchAction: "pan-y",
      }}>

        {/* ── View router ── */}
        {view === "dashboard" && DashView()}

        {view === "quicklog" && (
          <QuickLogView
            crew={crew}
            routes={routes}
            setRoutes={setRoutes}
            initialForm={qlInitialForm}
            editFlightId={qlEditFlightId}
            onSave={handleSaveLog}
            onBack={() => { setView(qlReturnView); setQlEditFlightId(null); }}
            dark={isDark}
            c={c}
            profileId={profileId}
            allTags={allTags}
          />
        )}

        {view === "profile" && ProfView()}

        {view === "mylog" && (
          <MyLogView
            flights={flights}
            crew={crew}
            username={username}
            onBack={() => setView("dashboard")}
            onGoProfile={(id) => { setProfileId(id); setView("profile"); }}
            onEdit={(f) => { openQL(null, f, "mylog"); }}
            c={c}
          />
        )}

        {view === "guide" && (
          <GuideView onBack={() => setView("settings")} c={c} />
        )}

        {view === "stats" && (
          <StatsView crew={crew} flights={flights} onBack={() => setView("settings")} showAcStats={appShowAcStats} showRouteStats={appShowRouteStats} c={c} />
        )}

        {view === "themes" && (
          <ThemeGalleryView 
            onBack={() => setView("settings")} 
            themeKey={themeKey} 
            setThemeKey={setThemeKey}
            c={c} 
          />
        )}

        {view === "fonts" && (
          <FontGalleryView 
            onBack={() => setView("settings")} 
            fontKey={fontKey} 
            setFontKey={setFontKey}
            c={c} 
          />
        )}

        {view === "settings" && (
          <SettingsView
            onBack={() => setView("dashboard")}
            c={c}
            themeKey={themeKey}
            setThemeKey={setThemeKey}
            fontKey={fontKey}
            setFontKey={setFontKey}
            username={username}
            onLogout={logout}
            onExport={exportJSON}
            onGoGuide={() => setView("guide")}
            onGoStats={() => setView("stats")}
            onGoThemes={() => setView("themes")}
            onGoFonts={() => setView("fonts")}
            defaultAircraft={defaultAircraft}
            setDefaultAircraft={setDefaultAircraft}
            defaultPosition={defaultPosition}
            setDefaultPosition={setDefaultPosition}
            customTags={customTags}
            setCustomTags={setCustomTags}
            onImport={handleImport}
            routes={routes}
            setRoutes={setRoutes}
            flights={flights}
          />
        )}

      </div>
    </>
  );
}
