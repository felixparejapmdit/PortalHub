# PortalHub

<div align="center">
  <img src="apple-touch-icon.png" alt="PortalHub Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
  <h3>Unified Service Gateway & Family Portfolio Hub</h3>
  <p>Dual-stack IPv4/IPv6 intranet launcher with Google Authentication, Access-Gated Admin Approval, and PWA Mobile Support.</p>
</div>

---

## Features

- **Google Authentication & Access Control**:
  - Direct integration with Google Identity Services (`g_id_signin`).
  - **Super Administrator**: `felixpareja.pmdit07@gmail.com` enjoys instant access and family approval authority.
  - **Access-Gated Family Approval Flow**: Non-admin sign-ins generate an access request awaiting admin verification.
  - **Admin Access Requests Modal**: Approve or decline family member sign-up requests, view processed statuses, and pre-approve members with 1 click.
- **Unified Service Launcher**:
  - Launch internal web applications (e.g. [Ipon PSE Portfolio](https://ipon-pse-portfolio.web.app/)) in fullscreen iframe mode.
  - Sticky top-right floating navigation bar with app switcher drawer, popout, and reload capabilities.
  - Flexible **Grid View** (<i class="fa-solid fa-table-cells-large"></i>) and **Table View** (<i class="fa-solid fa-table-list"></i>) toggling.
- **PWA & Mobile Ready**:
  - Full Apple mobile web app capability (`apple-mobile-web-app-capable: yes`, `black-translucent` status bar).
  - High-resolution `apple-touch-icon.png` and `manifest.json` for home screen install.
- **Dual-Stack Local Gateway**:
  - Python multithreaded dual-stack server supporting `http://localhost:8088` (IPv6 `::1`), `http://127.0.0.1:8088` (IPv4), and LAN IPs.
  - Permissive CORS headers allowing seamless embedding of local subprojects.

---

## Quick Start

### 1. Launch via Batch File (Windows)
Double-click `start_portal.bat` or run:
```cmd
start_portal.bat
```

### 2. Launch via Python
```bash
python serve.py
```
Open your browser to:
[http://localhost:8088/Portal/index.html](http://localhost:8088/Portal/index.html)

---

## Project Structure

```
Portal/
├── index.html            # Main PortalHub application & dashboard
├── manifest.json         # Progressive Web App manifest
├── apple-touch-icon.png  # High-res PWA & Apple Touch icon
├── favicon.png           # Browser tab favicon
├── serve.py              # Multithreaded dual-stack IPv4/IPv6 server
├── start_portal.bat      # One-click Windows server launcher
└── README.md             # Documentation
```

---

## Authentication & Security

- **Primary Admin**: `felixpareja.pmdit07@gmail.com`
- **Continue with Google**: Powered by Google & Firebase Auth with one-click access.
- **Firebase & Firestore Ready**:
  - Pre-configured with Firebase 10.x SDKs (`firebase-app`, `firebase-auth`, and `firebase-firestore`).
  - Supports pasting your Firebase project credentials in Settings for real-time cloud authentication and multi-device access request synchronization.
  - Zero-setup offline fallback ensures full local operation without required cloud keys.

---

## Deploy to Firebase Hosting

PortalHub includes a ready-to-use [`firebase.json`](firebase.json) configured for fast single-page app hosting.

### Step 1: Install Firebase CLI
If you haven't installed `firebase-tools`, install it globally using npm:
```bash
npm install -g firebase-tools
```

### Step 2: Log In to Firebase
Log in with the Google account that manages your Firebase project:
```bash
firebase login
```

### Step 3: Select or Initialize Your Project
From inside the `Portal` folder:
```bash
# Option A: Connect to an existing project (e.g., your portfolio project)
firebase use --add

# Option B: Create a brand new Firebase project in the Firebase Console
# https://console.firebase.google.com/
```

> **Note on Existing Sites**: If you use the existing `ipon-pse-portfolio` project, you can either:
> 1. Deploy PortalHub as a secondary site using [Firebase Multisite](https://firebase.google.com/docs/hosting/multisite) (`firebase hosting:sites:create <subsite-name>`), OR
> 2. Create a dedicated project like `portalhub-central` so your Ipon portfolio at `ipon-pse-portfolio.web.app` remains completely separate.

### Step 4: Deploy
Run the deploy command:
```bash
firebase deploy --only hosting
```
Once complete, Firebase will output your live URL:
`https://<your-project-id>.web.app`

### Step 5: Authorize Google Sign-In Domain
To ensure Google Sign-In works on your live URL:
1. Go to [Firebase Console](https://console.firebase.google.com/) -> Select your Project.
2. Navigate to **Authentication** -> **Settings** tab -> **Authorized domains**.
3. Confirm that your hosting domain (e.g. `your-app.web.app`) is listed in Authorized Domains.


