# PortalHub

<div align="center">
  <img src="apple-touch-icon.png" alt="PortalHub Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
  <h3>One launcher for your home-lab services, local projects, and web apps</h3>
  <p>Dashboards, pinned apps, command palette, split view, QR codes, offline support, Google sign-in with admin approval.</p>
</div>

---

## Features

- **Dashboards**: separate pages such as *Home*, *Work* and *Family*. Add, rename or remove them from the tab bar or Settings.
- **Grid view by default**, plus a compact **List** and a 3D **Carousel**. Every view uses cards, and your choice is remembered.
- **Pinned block**: pin your most-used apps to their own block at the top of each dashboard.
- **Drag to reorder**: drag cards within a block, or between *Pinned* and *All services* to pin or unpin. With the keyboard, focus a card and press `Alt` + arrow keys, or use the card's ⋯ menu (*Move earlier / later*).
- **Sort** by custom order, recently used, most used, or name.
- **Tags and categories** with multi-select filter chips (categories narrow by category, `#tags` by tag).
- **Command palette** (`Ctrl K` / `⌘K`): jump to any app on any dashboard, search `#tags`, switch views, sort, theme, export/import, and admin tools.
- **Auto-fill**: paste an address and PortalHub reads the page's title, description and icon. LAN pages are read through the local gateway (`serve.py`); public sites use their public icon. Sites that block embedding are set to open in a new tab automatically.
- **QR code per app**: open any app on your phone. `localhost` addresses are rewritten to this computer's LAN IP.
- **Split view**: open two apps side by side, with a resizable divider (drag it, or use the arrow keys when it's focused).
- **Backup & restore**: export everything to JSON, then merge it back in or replace your apps.
- **Delete with Undo**: deleting an app shows an *Undo* button instead of a confirmation prompt.
- **Offline mode & installable app (PWA)**: a service worker caches the portal, its scripts, fonts and icons, so PortalHub opens without internet and your LAN apps keep working. You can install it from the account menu or the browser's install button.
- **Activity log (admin)**: sign-ins, sign-outs, access requests, approvals, revocations and app opens, grouped by day and filterable.
- **Google sign-in & admin approval**: new people request access, and the admin approves or declines them in real time. Pre-approve family members by email.
- **Design**: light and true-black dark themes with frosted-glass surfaces and electric-blue / emerald accents.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl K` / `⌘K` | Command palette (switch apps while one is open) |
| `/` | Filter the current dashboard |
| `Enter` (in the filter box) | Open the first match |
| `Esc` | Clear the filter, or close the open dialog / menu |
| `Alt` + arrows (on a focused card) | Move the card earlier / later |
| `Shift F10` or `Menu` key (on a card) | Open the card's actions menu |
| `←` / `→` | Browse in Carousel view |

---

## Quick Start

### 1. Launch via Batch File (Windows)
Double-click `start_portal.bat` or run:
```cmd
start_portal.bat
```

### 2. Launch via Python
```bash
python serve.py              # opens your browser automatically
python serve.py --no-browser # server only
```
Open your browser to:
[http://localhost:8088/Portal/index.html](http://localhost:8088/Portal/index.html)

The console also prints `LAN URL` lines you can open from a phone on the same Wi-Fi.

---

## Project Structure

```
Portal/
├── index.html              # Page markup and design system (CSS tokens, glass components)
├── js/
│   ├── portal-auth.js      # Sign-in, admin approval, Firestore sync, audit log
│   ├── portal-app.js       # Dashboards, cards, filters, palette, split view, QR, backups, offline
│   └── vendor/             # SortableJS 1.15.2 (drag & drop), qrcode-generator 1.4.4 (MIT)
├── sw.js                   # Service worker (offline support)
├── manifest.json           # Progressive Web App manifest
├── icons/                  # PWA icons (192, 512, maskable) and source artwork
├── apple-touch-icon.png    # 180×180 home-screen icon
├── favicon.png             # 48×48 browser tab icon
├── firestore.rules         # Firestore security rules
├── firebase.json           # Firebase Hosting config
├── serve.py                # Local dual-stack gateway + metadata API for auto-fill and QR codes
├── start_portal.bat        # One-click Windows server launcher
└── README.md
```

### Local gateway API (`serve.py`)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/info` | This machine's LAN addresses (used by QR codes) |
| `GET /api/meta?url=…` | Title, description and icon of a page (used by auto-fill) |

The API answers only same-origin requests from a local host name. It sends no CORS headers,
refuses cross-site and DNS-rebinding requests, and returns only the title/description/icon, never page bodies.

---

## Authentication & Security

- **Admin**: `felixpareja.pmdit07@gmail.com`. Sign in with **Google** as the admin: the Firestore rules
  require a verified email for admin actions, so an unverified email/password account can't use that address.
- **Firestore rules** (`firestore.rules`):
  - `access_requests`: people can file and refresh only their own request; only the admin can list, read others', or delete.
  - `portal_settings/access_control`: readable by signed-in users (pending users watch for their approval), writable only by the admin.
  - `audit_log`: write-once entries with a server timestamp; only the admin can read them or record approve/decline/revoke events.
- Everything rendered from app data or Firestore is HTML-escaped.
- Apps, dashboards and categories are stored per browser (`localStorage`). Use *Export backup* / *Import backup* to move them between devices.

---

## Deploy to Firebase Hosting (`portalhub-f3221`)

PortalHub is pre-configured with [`.firebaserc`](.firebaserc) and [`firebase.json`](firebase.json) linked to project **`portalhub-f3221`**.

### Step 1: Install Firebase CLI
If you haven't installed `firebase-tools`, install it globally using npm:
```bash
npm install -g firebase-tools
```

### Step 2: Log In to Firebase
Log into the Google account (`felixpareja.pmdit07@gmail.com`) that owns the project:
```bash
firebase login
```

### Step 3: Project Configuration (Already Done!)
Your local workspace is already connected to `portalhub-f3221` via `.firebaserc`:
```json
{
  "projects": {
    "default": "portalhub-f3221"
  }
}
```

### Step 4: Deploy Hosting and the Firestore rules
Run inside `d:\PROJECTS\Portal`:
```bash
firebase deploy --only firestore:rules --dry-run   # check the rules compile
firebase deploy --only hosting,firestore:rules
```
Once complete, your app is live at:
- **`https://portalhub-f3221.web.app`**
- **`https://portalhub-f3221.firebaseapp.com`**

### Step 5: Firebase Console Setup (Authentication & Web App)
On your [Firebase Console for portalhub-f3221](https://console.firebase.google.com/project/portalhub-f3221/overview):
1. **Enable Google Sign-In**:
   - In left menu, click **Authentication** &rarr; **Get Started**.
   - Under **Sign-in providers**, click **Google** &rarr; toggle **Enable**.
   - Select your support email (`felixpareja.pmdit07@gmail.com`) and click **Save**.
2. **Add Web App** (for SDK Config):
   - On the Project Overview page, click the **`+ Add app`** button and select the **`</>` Web** icon.
   - App nickname: `PortalHub` &rarr; click **Register app**.
   - Copy the generated `firebaseConfig` object and paste it into PortalHub Settings (or into `DEFAULT_FIREBASE_CONFIG` in `js/portal-auth.js`).
3. **Verify Authorized Domains**:
   - In **Authentication** &rarr; **Settings** &rarr; **Authorized domains**, ensure `portalhub-f3221.web.app` and `localhost` are listed.
