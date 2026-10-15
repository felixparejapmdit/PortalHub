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

### 3. On a NAS or Linux server
See [Deploy on a NAS](#deploy-on-a-nas) (Docker or plain Python).

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
├── serve.py                # Gateway server (portal + web projects + API); Python 3.8+, no dependencies
├── start_portal.bat        # One-click Windows server launcher
├── start_portal.sh         # Linux / NAS launcher without Docker
├── Dockerfile              # Container image for the gateway
├── docker-compose.yml      # NAS deployment (Synology, QNAP, TrueNAS, Unraid, ...)
└── README.md
```

### Local gateway API (`serve.py`)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check (used by Docker) |
| `GET /api/info` | The gateway's LAN addresses (used by QR codes) |
| `GET /api/meta?url=…` | Title, description and icon of a page (used by auto-fill) |

The API answers only same-origin requests that reach the server through a local address: an IP
address, `localhost`, a single-label name like `diskstation`, or a `.local` / `.lan` / `.home.arpa`
name. Other host names (for example a reverse-proxy domain) must be listed in `PORTALHUB_ALLOWED_HOSTS`.
It sends no CORS headers, refuses cross-site requests, and returns only the title/description/icon,
never page bodies.

The server never serves dot-files or dot-folders (`.git`, `.env`, `.firebase`, ...) and doesn't list
folder contents unless you turn that on.

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

## Deploy on a NAS

PortalHub runs on any NAS or Linux box that has Docker or Python 3.8+. The gateway serves the portal at
`/Portal/`, any other web projects you give it at `/<folder>/`, and the auto-fill / QR-code API.
Opening `http://<nas-address>:8088/` goes straight to the portal.

### Option A: Docker (recommended)

1. Copy the project to the NAS, for example over SSH:
   ```bash
   cd /volume1/docker
   git clone https://github.com/felixparejapmdit/PortalHub.git portalhub
   cd portalhub
   ```
   (Or upload the folder with File Station or your NAS's file manager.)
2. Optional: create a `.env` file next to `docker-compose.yml` to change settings:
   ```ini
   PORTALHUB_HOST_PORT=8088            # port on the NAS
   PORTALHUB_SITES=/volume1/web        # folder with your other web projects (served at /<folder>/)
   PORTALHUB_LAN_HOST=192.168.1.50     # NAS address to put in QR codes (optional)
   PORTALHUB_UID=1026                  # NAS user that can read PORTALHUB_SITES (run `id` over SSH)
   PORTALHUB_GID=100
   ```
3. Start it:
   ```bash
   docker compose up -d --build
   ```
   - **Synology (DSM 7.2+):** *Container Manager* > *Project* > *Create*, choose the `portalhub` folder.
     It picks up `docker-compose.yml`; tick *Build* and finish the wizard.
   - **QNAP:** *Container Station* > *Applications* > *Create*, then paste `docker-compose.yml`.
4. Open `http://<nas-address>:8088/`.

Without `PORTALHUB_SITES`, a `sites/` folder next to `docker-compose.yml` is used, so
`sites/PSE/index.html` is served at `http://<nas-address>:8088/PSE/index.html`. Apps saved as
`D:/PROJECTS/<folder>/...` or `http://localhost:8088/<folder>/...` automatically point at the NAS when
you open PortalHub from there.

**Update** after pulling new code:
```bash
git pull && docker compose up -d --build
```

### Option B: Python, without Docker

```bash
cd /volume1/web/Portal          # wherever the Portal folder is
chmod +x start_portal.sh
./start_portal.sh               # serves the parent folder's projects next to the portal
./start_portal.sh --root /volume1/web --port 8090   # or choose the folder and port
```
To start it with the NAS on Synology: *Control Panel* > *Task Scheduler* > *Create* > *Triggered Task* >
*Boot-up*, run as your user, with the command `/volume1/web/Portal/start_portal.sh`.

### Settings

Every setting is a command-line flag for `serve.py` or an environment variable.

| Flag | Environment variable | Default | Purpose |
| --- | --- | --- | --- |
| `--port` | `PORTALHUB_PORT` | `8088` | Port the server listens on |
| `--bind` | `PORTALHUB_BIND` | all interfaces | Address to listen on, e.g. `127.0.0.1` behind a reverse proxy |
| `--root` | `PORTALHUB_ROOT` | folder containing `Portal` | Folder whose sub-folders are served as web projects |
| `--lan-host` | `PORTALHUB_LAN_HOST` | detected | Address phones should use in QR codes |
| `--allowed-hosts` | `PORTALHUB_ALLOWED_HOSTS` | none | Extra host names (comma-separated) allowed to use the API, e.g. `portal.example.com` |
| `--dir-listing` | `PORTALHUB_DIR_LISTING=1` | off | List the files of folders that have no `index.html` |
| `--no-browser` | `PORTALHUB_OPEN_BROWSER=0` | opens a browser | Don't open a browser on start |

In `docker-compose.yml`, `PORTALHUB_HOST_PORT`, `PORTALHUB_SITES`, `PORTALHUB_UID` and `PORTALHUB_GID`
choose the NAS port, the projects folder, and the user the container runs as.

### Google sign-in on the NAS

Firebase only allows sign-in from approved addresses. In the Firebase console open
*Authentication* > *Settings* > *Authorized domains* > *Add domain* and add the address you use for the
NAS (its hostname, e.g. `diskstation.local`, or its IP address).

### HTTPS, offline mode and installing the app

Browsers only allow offline mode (the service worker) and *Install app* on HTTPS pages or `localhost`.
Over plain `http://<nas-ip>` everything else works, but PortalHub won't open without the network.

To get them, put PortalHub behind your NAS's reverse proxy with a certificate. On Synology:
*Control Panel* > *Login Portal* > *Advanced* > *Reverse Proxy* > *Create*: source `HTTPS`, your hostname,
port `443`; destination `HTTP`, `localhost`, port `8088`. Then add that hostname to
`PORTALHUB_ALLOWED_HOSTS` (unless it is a `.local` / `.lan` name) and to Firebase's authorized domains.

On an HTTPS page, browsers block embedding plain-`http://` services, so those apps open in a new tab
instead of inside PortalHub. Use plain HTTP if you'd rather embed them.

### Security notes

- Keep port 8088 on your home network; don't forward it to the internet. For remote access use a VPN
  (Tailscale, WireGuard, your NAS's VPN server) or the reverse proxy above.
- Mount project folders read-only (the compose file does) and don't keep secrets in them. Dot-files are
  never served, but everything else in `PORTALHUB_SITES` is.

---

## Deploy to Firebase Hosting (`portalhub-f3221`)

PortalHub is pre-configured with [`.firebaserc`](.firebaserc) and [`firebase.json`](firebase.json) linked to project **`portalhub-f3221`**.

### Update the live site

After changing PortalHub, publish the website and the Firestore security rules with one command,
run inside `D:\PROJECTS\Portal`:
```bash
npx -y firebase-tools@14 deploy --only hosting,firestore:rules --project portalhub-f3221
```
- `npx -y firebase-tools@14` downloads and runs the Firebase CLI, so nothing has to be installed first.
- `hosting` uploads the website files and `firestore:rules` publishes `firestore.rules`. Deploy them
  together: the website expects the current rules.
- The first time on a computer, sign in once with the account that owns the project:
  ```bash
  npx -y firebase-tools@14 login
  ```
- To only check that the rules compile, without publishing anything:
  ```bash
  npx -y firebase-tools@14 deploy --only firestore:rules --dry-run --project portalhub-f3221
  ```

Once complete, your app is live at:
- **`https://portalhub-f3221.web.app`**
- **`https://portalhub-f3221.firebaseapp.com`**

### First-time Firebase console setup (Authentication & Web App)
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
   - In **Authentication** &rarr; **Settings** &rarr; **Authorized domains**, ensure `portalhub-f3221.web.app`,
     `localhost`, and your NAS address (if you run PortalHub there) are listed.
