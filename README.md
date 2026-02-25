# ✈ CabinLog — 我的天空日記
### EVA Air Edition · Private Cabin Crew Companion

A mobile-first progressive web app (PWA) for EVA Air cabin crew to privately log flight experiences, track colleagues, and build a personal crew reference over time. Built with React 18, Firebase Firestore, and Vite. Deployable to Vercel in minutes.

---

## Features

**Crew Directory** — shared across all users, always up to date. Search by employee ID, Chinese name, or English nickname. Each crew member has a status light (🟢🟡🔴), tags, and shared notes.

**Private Flight Logs** — fully private per user, never visible to others. Log flight number, route, aircraft type, cabin position, date, and a personal memo for every flight worked.

**5 Themes × 2 Modes = 10 Looks** — switch between themes in Settings at any time. Choice is saved to the device.

**Two-Layer Auth** — shared passcode gate + personal username/password. No Firebase Auth required. Admin can add/remove accounts, toggle open registration, and view usage stats.

**Password Reset via OTP** — forgot-password flow sends a one-time code to the user's registered email via EmailJS.

**PWA / Add to Home Screen** — works offline-first, installable on iOS and Android like a native app.

**Backup & Restore** — export all data as a JSON file, re-import on any device.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 (hooks, no class components) |
| Database | Firebase Firestore (real-time sync) |
| Auth | Custom passcode + Firestore accounts doc |
| Email | EmailJS (password reset OTP) |
| Build | Vite 5 |
| Hosting | Vercel |
| PWA | Web App Manifest + meta tags |

---

## Project Structure

```
/
├── src/
│   ├── App.jsx          # All views, state, and logic (single-file architecture)
│   ├── main.jsx         # React DOM entry point
│   ├── firebase.js      # Firebase project config + Firestore export
│   └── crewData.js      # Initial crew seed data (loaded once on first boot)
├── index.html           # HTML shell with PWA meta tags
├── manifest.json        # PWA manifest (name, icons, theme colour)
├── vite.config.js       # Vite build config
├── vercel.json          # SPA rewrite rules for Vercel deployment
└── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project with Firestore enabled
- A Vercel account (free tier is fine)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/cabinlog.git
cd cabinlog
npm install
```

### 2. Configure Firebase

Open `src/firebase.js` and replace the config object with your own Firebase project credentials:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

You can find these values in the Firebase Console under **Project Settings → Your apps → Web app → Config**.

### 3. Set up Firestore

In the Firebase Console:
1. Go to **Firestore Database → Create database**
2. Start in **production mode**
3. Add the following security rules (paste into the Rules tab):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /crewlog/{docId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ These rules allow open read/write. The app enforces auth in the client — tighten rules further once you're comfortable with Firestore security.

### 4. Configure EmailJS (optional — for password reset)

If you want the forgot-password OTP flow to work:
1. Create a free account at [emailjs.com](https://www.emailjs.com)
2. Add an Email Service (e.g. Gmail)
3. Create a template with variables: `{{to_email}}`, `{{username}}`, `{{otp_code}}`
4. In `src/App.jsx`, update the three constants near the top:

```js
const EMAILJS_SERVICE_ID  = "service_xxxxxx";
const EMAILJS_TEMPLATE_ID = "template_xxxxxx";
const EMAILJS_PUBLIC_KEY  = "your_public_key";
```

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy to Vercel

```bash
npm run build
# then push to GitHub and import the repo in Vercel
```

Vercel will auto-detect Vite and deploy. The `vercel.json` file handles SPA routing so deep links work correctly.

---

## First Boot & Admin Setup

On the very first login ever (empty Firestore):

1. Open the app and enter the shared passcode: `crew2026`
2. On the personal login screen, enter username `adminsetup` and choose any password
3. This seeds the accounts document and creates your admin account
4. Log in normally from now on — the admin account can add other users in Settings

**To add users:** go to Settings → scroll down to the Admin section → fill in username, password, and email → tap Add.

---

## Themes

The app ships with 5 themed palettes, each with a light and dark variant, for 10 total combinations. Switch in **Settings → 外觀主題 THEMES**.

| # | Theme | Inspiration | Light feel | Dark feel |
|---|---|---|---|---|
| 🛫 1 | **Boarding Look** | EVA Air brand identity | Pure white + EVA green | Deep pine + Persimmon orange |
| 🌿 2 | **Shiatzy Chen** | Tourmaline green uniform | Mist green-grey + Chief Purser red | Classic dark + Vibrant tourmaline |
| ✨ 3 | **Royal Laurel** | 787 Dreamliner business class | Champagne cream + Soft gold | Stone black + Metallic gold |
| 🌈 4 | **Sky Scarf** | Crew geometric scarves | White + Sunrise orange + Sky blue | Midnight blue + Electric sky blue |
| 🖥 5 | **Tech Log** | Flight deck instrumentation | Silver cloud + Industrial green | OLED black + Phosphor green |

The default theme on first install is **Night Flight (eva1Dark)**.

---

## Aircraft & Positions

### Aircraft
`B777` · `B787` · `A321` · `A330`

### Cabin Positions
| Code | Role | 中文 |
|---|---|---|
| CP | Chief Purser | 事務長 |
| DP | Deputy Purser | 副事務長 |
| AP | Assistant Purser | 助理事務長 |
| CA | Cabin Attendant | 一般組員 |
| TA | Trainee Attendant | 實習組員 |

---

## Data Privacy Model

| Data | Who can see it |
|---|---|
| Crew names, seniority, employee ID | All users (shared) |
| Crew status lights (🟢🟡🔴) | All users (shared) |
| Crew tags | All users (shared) |
| Crew notes | All users (shared) |
| **Flight logs, memos, routes** | **You only (private)** |
| Registered email address | Admin only |
| Password | Nobody (stored as plaintext in Firestore — recommend hashing for production) |

---

## crewData.js — Seeding Your Crew List

`crewData.js` exports `INITIAL_CREW`, an array of crew objects loaded into Firestore only when the database is empty on first boot. After that, the shared crew list lives in Firestore and is managed through the UI.

To bulk-load your real crew before launch:
1. Replace the sample entries in `crewData.js` with real data
2. Clear Firestore (if you've already booted once) and reboot, **or** use the Admin account to manually add crew via the UI

Each crew object shape:

```js
{
  id:        "BR40001",      // Employee ID — unique primary key
  nickname:  "Sophie",       // English name / callsign
  name:      "劉思琪",        // Full Chinese name
  seniority: "BR22A",        // Training batch
  status:    "green",        // "green" | "yellow" | "red" | null
  tags:      ["#細心"],       // Subset of preset or custom tags
  notes:     "...",          // Shared long-form notes
}
```

---

## Scripts

```bash
npm run dev      # Start local dev server at http://localhost:5173
npm run build    # Production build into /dist
npm run preview  # Preview the production build locally
```

---

## Customisation Checklist

Before going live, review these values in `App.jsx`:

- [ ] `APP_PASSCODE` — change from `"crew2026"` to something private
- [ ] `EMAILJS_SERVICE_ID` / `EMAILJS_TEMPLATE_ID` / `EMAILJS_PUBLIC_KEY` — your EmailJS credentials
- [ ] `AIRCRAFT` — adjust if EVA's operated fleet changes
- [ ] `POSITIONS` — adjust if position codes change
- [ ] `PRESET_TAGS` — add or remove built-in tags
- [ ] `index.html` — update `<title>` and `theme-color`
- [ ] `manifest.json` — update `name`, `short_name`, `theme_color`
- [ ] Replace `/logo.png` with your own app icon (512×512 recommended)

---

## License

Private / internal use. Not for redistribution.

---

*Built with ✈ & ❤ — Your logs are safe & private.*
