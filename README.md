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

### Step 4: Deploy to Hosting
Run the deploy command inside `d:\PROJECTS\Portal`:
```bash
firebase deploy --only hosting
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
   - Copy the generated `firebaseConfig` object and paste it into PortalHub Settings (or into `DEFAULT_FIREBASE_CONFIG` in `index.html`).
3. **Verify Authorized Domains**:
   - In **Authentication** &rarr; **Settings** &rarr; **Authorized domains**, ensure `portalhub-f3221.web.app` and `localhost` are listed.



