// ==========================================================================
// PortalHub dashboard UI
// Apps, dashboards, filters, views, drag & drop, command palette, split view,
// QR codes, backups, the activity log view, and offline support.
// Sign-in, access control and the audit log live in portal-auth.js (loaded first).
// ==========================================================================

// ==========================================
// STORAGE & DEFAULTS
// ==========================================
const STORAGE_KEYS = {
    apps: 'myportal_apps',
    categories: 'myportal_categories',
    dashboards: 'portalhub_dashboards',
    activeDashboard: 'portalhub_active_dashboard',
    view: 'portalhub_view_type',
    sort: 'portalhub_sort',
    usage: 'portalhub_usage',
    collapsedBlocks: 'portalhub_collapsed_blocks',
    theme: 'myportal_theme'
};

function readStored(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch(e) {
        return fallback;
    }
}

function writeStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch(e) {
        showToast('Could not save: browser storage is full or blocked', { error: true });
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const defaultCategories = ['Servers & Cloud', 'Smart Home', 'Dashboard', 'Tools', 'Productivity'];

const defaultDashboards = [
    { id: 'home', name: 'Home', icon: 'fa-house' },
    { id: 'work', name: 'Work', icon: 'fa-briefcase' },
    { id: 'family', name: 'Family', icon: 'fa-people-roof' }
];

const defaultApps = [
    {
        id: 'homeassistant',
        name: 'Home Assistant',
        url: 'http://homeassistant.local:8123',
        category: 'Smart Home',
        dashboardId: 'home',
        pinned: true,
        tags: ['iot', 'automation'],
        icon: 'fa-house-signal',
        color: 'from-sky-500 to-blue-600',
        launchMode: 'iframe',
        description: 'Unified smart home automation controller and IoT device manager.'
    },
    {
        id: 'proxmox',
        name: 'Proxmox VE',
        url: 'https://192.168.1.100:8006',
        category: 'Servers & Cloud',
        dashboardId: 'home',
        pinned: true,
        tags: ['admin', 'virtualization'],
        icon: 'fa-server',
        color: 'from-orange-500 to-amber-600',
        launchMode: 'newtab',
        description: 'Enterprise virtualization platform for virtual machines and LXC containers.'
    },
    {
        id: 'portainer',
        name: 'Portainer CE',
        url: 'http://192.168.1.105:9000',
        category: 'Servers & Cloud',
        dashboardId: 'home',
        pinned: true,
        tags: ['admin', 'docker'],
        icon: 'fa-cubes',
        color: 'from-blue-600 to-cyan-500',
        launchMode: 'iframe',
        description: 'Centralized Docker container management and swarm orchestration.'
    },
    {
        id: 'grafana',
        name: 'Grafana Dashboard',
        url: 'http://192.168.1.110:3000',
        category: 'Dashboard',
        dashboardId: 'home',
        pinned: false,
        tags: ['monitoring'],
        icon: 'fa-chart-line',
        color: 'from-amber-500 to-red-500',
        launchMode: 'iframe',
        description: 'Real-time telemetry, server metrics, network load, and observability analytics.'
    },
    {
        id: 'nextcloud',
        name: 'Nextcloud Hub',
        url: 'http://192.168.1.120:8080',
        category: 'Productivity',
        dashboardId: 'home',
        pinned: false,
        tags: ['files'],
        icon: 'fa-cloud',
        color: 'from-indigo-500 to-purple-600',
        launchMode: 'iframe',
        description: 'Self-hosted private cloud storage, file sharing, calendar, and collaboration.'
    },
    {
        id: 'pihole',
        name: 'Pi-hole Admin',
        url: 'http://192.168.1.2:80/admin',
        category: 'Tools',
        dashboardId: 'home',
        pinned: false,
        tags: ['dns', 'network'],
        icon: 'fa-shield-halved',
        color: 'from-rose-500 to-pink-600',
        launchMode: 'iframe',
        description: 'Network-wide ad-blocking and DNS sinkhole security gateway.'
    }
];

// Icon gradients offered in the Add/Edit app dialog (includes every sample app's color)
const APP_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-sky-500 to-blue-600',
    'from-cyan-500 to-blue-600',
    'from-blue-600 to-cyan-500',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-orange-500 to-amber-600',
    'from-amber-500 to-red-500',
    'from-rose-500 to-red-600',
    'from-rose-500 to-pink-600',
    'from-purple-500 to-pink-600',
    'from-indigo-500 to-purple-600',
    'from-slate-500 to-slate-700'
];

// Dashboard icons picked from the name when a dashboard is created
const DASHBOARD_ICON_HINTS = [
    [/home|house/i, 'fa-house'],
    [/work|office|job/i, 'fa-briefcase'],
    [/family|kids|parents/i, 'fa-people-roof'],
    [/lab|dev|code|project/i, 'fa-flask'],
    [/media|movie|music|stream/i, 'fa-film'],
    [/game|gaming/i, 'fa-gamepad'],
    [/school|study|learn/i, 'fa-graduation-cap'],
    [/server|infra|network|ops/i, 'fa-server'],
    [/finance|money|bank/i, 'fa-wallet']
];

const VIEW_TYPES = ['grid', 'list', 'carousel'];
const SORT_LABELS = { custom: 'Custom order', recent: 'Recently used', frequent: 'Most used', name: 'Name A–Z' };

// ==========================================
// ESCAPING & SMALL HELPERS
// ==========================================
// Escape untrusted text (app fields, Firestore access requests) before inserting it as HTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Encode a value as a JS string literal that is safe inside an inline on* attribute
function jsArg(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
}

function cleanTag(tag) {
    return String(tag || '').trim().toLowerCase()
        .replace(/^#+/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 24);
}

function slugify(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'dashboard';
}

// Only data: images and http(s) URLs are accepted as app icons
function isSafeImageUrl(url) {
    return typeof url === 'string' && url.length < 200000 &&
        (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(url) || /^https?:\/\/[^\s"'<>]+$/i.test(url));
}

// Compact address for cards: drop the scheme and trailing slash
function displayUrl(url) {
    return String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function isPrivateHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || !host.includes('.') ||
        /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
        /\.(local|lan|home|internal|home\.arpa)$/.test(host);
}

function isOpen(id) {
    const el = document.getElementById(id);
    return !!(el && !el.classList.contains('hidden'));
}

// ==========================================
// STATE (loaded from localStorage, normalized on load and import)
// ==========================================
function normalizeDashboard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 40);
    if (!name) return null;
    const id = String(raw.id || slugify(name)).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || ('dash-' + Date.now());
    const icon = /^fa-[a-z0-9-]+$/.test(raw.icon || '') ? raw.icon : 'fa-table-cells-large';
    return { id, name, icon };
}

function normalizeApp(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const app = {
        id: String(source.id || ('app-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7))).slice(0, 80),
        name: String(source.name || 'Untitled app').trim().slice(0, 80),
        url: String(source.url || '').trim().slice(0, 2000),
        category: String(source.category || categories[0] || 'General').trim().slice(0, 40),
        dashboardId: dashboards.some(d => d.id === source.dashboardId) ? source.dashboardId : dashboards[0].id,
        pinned: typeof source.pinned === 'boolean' ? source.pinned : source.section === 'favorite',
        tags: Array.isArray(source.tags) ? [...new Set(source.tags.map(cleanTag).filter(Boolean))].slice(0, 12) : [],
        icon: /^fa-[a-z0-9-]+$/.test(source.icon || '') ? source.icon : 'fa-server',
        color: /^from-[a-z]+-\d{2,3} to-[a-z]+-\d{2,3}$/.test(source.color || '') ? source.color : APP_COLORS[0],
        launchMode: source.launchMode === 'newtab' ? 'newtab' : 'iframe',
        description: String(source.description || '').trim().slice(0, 300),
        favicon: isSafeImageUrl(source.favicon) ? source.favicon : ''
    };
    return app;
}

let categories = (readStored(STORAGE_KEYS.categories, null) || [...defaultCategories]).map(c => String(c).trim().slice(0, 40)).filter(Boolean);
if (!categories.length) categories = [...defaultCategories];
let dashboards = (readStored(STORAGE_KEYS.dashboards, null) || clone(defaultDashboards)).map(normalizeDashboard).filter(Boolean);
if (!dashboards.length) dashboards = clone(defaultDashboards);
let apps = (readStored(STORAGE_KEYS.apps, null) || clone(defaultApps)).map(normalizeApp);
let usage = readStored(STORAGE_KEYS.usage, {});
if (!usage || typeof usage !== 'object' || Array.isArray(usage)) usage = {};

let activeDashboardId = localStorage.getItem(STORAGE_KEYS.activeDashboard);
if (!dashboards.some(d => d.id === activeDashboardId)) activeDashboardId = dashboards[0].id;

// Grid is the default view; older 'table' preferences map to the card list view
let currentViewType = localStorage.getItem(STORAGE_KEYS.view);
if (currentViewType === 'table') currentViewType = 'list';
if (!VIEW_TYPES.includes(currentViewType)) currentViewType = 'grid';

let sortMode = localStorage.getItem(STORAGE_KEYS.sort);
if (!SORT_LABELS[sortMode]) sortMode = 'custom';

let collapsedBlocks = new Set(readStored(STORAGE_KEYS.collapsedBlocks, []));
let selectedCategories = new Set();
let selectedTags = new Set();
let searchQuery = '';
let carouselActiveIndex = 0;
let currentActiveApp = null;
let splitApp = null;

function saveApps() { writeStored(STORAGE_KEYS.apps, apps); }
function saveCategories() { writeStored(STORAGE_KEYS.categories, categories); }
function saveDashboards() { writeStored(STORAGE_KEYS.dashboards, dashboards); }

function getActiveDashboard() {
    return dashboards.find(d => d.id === activeDashboardId) || dashboards[0];
}

function getDashboardName(id) {
    const dashboard = dashboards.find(d => d.id === id);
    return dashboard ? dashboard.name : '';
}

function isApprovedUser() {
    if (!currentUser) return false;
    if (isCurrentUserAdmin() || currentUser.role === 'guest') return true;
    const email = (currentUser.email || '').toLowerCase().trim();
    return approvedUsers.some(u => (u || '').toLowerCase().trim() === email);
}

// ==========================================
// USAGE (recently / most used)
// ==========================================
function recordUsage(appId) {
    const entry = usage[appId] || { count: 0, last: 0 };
    usage[appId] = { count: entry.count + 1, last: Date.now() };
    writeStored(STORAGE_KEYS.usage, usage);
}

function noteAppOpened(app) {
    recordUsage(app.id);
    logAudit('app_open', app.name);
}

// ==========================================
// URL HELPERS
// ==========================================
function normalizeAppUrl(rawInput) {
    if (!rawInput) return '';
    let input = rawInput.trim().replace(/\\+/g, '/');

    // Handle file:/// or local drive letters (e.g. D:/PROJECTS/PSE/index.html)
    const isLocalDrive = /^[a-zA-Z]:\//i.test(input);
    const isFileProto = /^file:\/\/\//i.test(input) || /^file:\/\//i.test(input);

    if (isFileProto || isLocalDrive) {
        if (isLocalDrive) return 'file:///' + input;
        return 'file:///' + input.replace(/^file:\/\/\/?/i, '');
    }

    // Relative paths like ../PSE/index.html or /PSE/index.html
    if (input.startsWith('../') || input.startsWith('./') || input.startsWith('/')) {
        return input;
    }

    // Check if standard HTTP/HTTPS
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
        if (/^(?:localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/.*)?$/i.test(input)) {
            return 'http://' + input;
        } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/i.test(input)) {
            return 'https://' + input;
        } else {
            return 'http://' + input;
        }
    }

    return input;
}

function isLocalFileUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase().replace(/\\+/g, '/');
    return lower.startsWith('file:') || /^[a-z]:\//i.test(lower);
}

function isKnownIframeBlocked(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    // YouTube embed URLs are allowed, but main youtube.com / watch page is blocked
    if (lower.includes('youtube.com/embed') || lower.includes('youtube-nocookie.com')) {
        return false;
    }
    const blockedDomains = [
        'google.com', 'google.',
        'youtube.com', 'youtu.be',
        'github.com',
        'facebook.com',
        'twitter.com', 'x.com',
        'linkedin.com',
        'instagram.com',
        'reddit.com',
        'netflix.com'
    ];
    return blockedDomains.some(d => lower.includes(d));
}

function getEmbeddableUrl(url) {
    if (!url) return '';
    let formatted = normalizeAppUrl(url);

    // Check if URL points to a subproject in PROJECTS folder
    const matchProjects = formatted.match(/(?:file:\/\/\/[a-zA-Z]:\/|[a-zA-Z]:\/)?(?:.*\/)?PROJECTS\/(.*)$/i);

    // If portal is loaded over HTTP (e.g. http://localhost:8088/Portal/central_dashboard_portal.html)
    if (window.location.protocol.startsWith('http')) {
        if (matchProjects && matchProjects[1]) {
            const cleanSub = matchProjects[1].replace(/^\/+/, '');
            return `${window.location.origin}/${cleanSub}`;
        }
        if (formatted.startsWith('/')) {
            return `${window.location.origin}${formatted}`;
        }
    } else if (window.location.protocol === 'file:' && isLocalServerOnline) {
        // If in file mode but port 8088 is online, route local PROJECTS apps via http://localhost:8088/
        if (matchProjects && matchProjects[1]) {
            const cleanSub = matchProjects[1].replace(/^\/+/, '');
            return `http://localhost:8088/${cleanSub}`;
        }
    }

    formatted = resolveLoopbackAddress(formatted);

    // Auto-convert YouTube watch URLs or youtu.be URLs to embed URLs
    const ytWatchMatch = formatted.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
    if (ytWatchMatch && ytWatchMatch[1]) {
        return `https://www.youtube.com/embed/${ytWatchMatch[1]}?autoplay=1`;
    }

    return formatted;
}

function isMixedContentBlocked(url) {
    if (window.location.protocol !== 'https:') return false;
    try {
        const target = new URL(url, window.location.href);
        return target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    } catch(e) {
        return false;
    }
}

function opensInNewTab(app) {
    return app.launchMode === 'newtab' || isMixedContentBlocked(getEmbeddableUrl(app.url));
}

// When PortalHub is served by the gateway on another machine (e.g. a NAS), "localhost" in an app's
// address means that machine, not the viewer's device, so point such addresses at it instead.
function resolveLoopbackAddress(url) {
    if (!window.location.protocol.startsWith('http')) return url;
    let parsed;
    try {
        parsed = new URL(url, window.location.href);
    } catch(e) {
        return url;
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'];
    if (!loopback.includes(parsed.hostname) || loopback.includes(window.location.hostname)) return url;
    // Only when the gateway serves this page (not on the Firebase-hosted site)
    if (!gatewayInfo && !isPrivateHost(window.location.hostname)) return url;
    const gatewayPort = String((gatewayInfo && gatewayInfo.port) || window.location.port || '');
    const appPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    if (appPort === gatewayPort) {
        // A project served by the gateway itself: use the address the viewer reached PortalHub with
        return window.location.origin + parsed.pathname + parsed.search + parsed.hash;
    }
    parsed.hostname = window.location.hostname;
    return parsed.href;
}

// Whether an app can be shown inside PortalHub (needed for split view)
function canEmbed(app) {
    if (!app || opensInNewTab(app) || isKnownIframeBlocked(app.url)) return false;
    if (isLocalFileUrl(app.url) && window.location.protocol === 'file:' && !isLocalServerOnline) return false;
    return true;
}

// ==========================================
// LOCAL GATEWAY (serve.py)
// ==========================================
let isLocalServerOnline = false;
let gatewayInfo = null; // { lan_ips, port } when served by serve.py

function checkLocalServerStatus() {
    // Served over HTTP(S) already: nothing to probe
    if (window.location.protocol !== 'file:') {
        updateGatewayBadge(true);
        return;
    }
    // file:// mode: ping port 8088 to check if local gateway server is active
    const testEndpoints = [
        'http://127.0.0.1:8088/PSE/index.html',
        'http://localhost:8088/PSE/index.html'
    ];

    let checked = false;
    testEndpoints.forEach(endpoint => {
        fetch(endpoint, { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                if (!checked) {
                    checked = true;
                    isLocalServerOnline = true;
                    updateGatewayBadge(true);
                }
            })
            .catch(() => {
                if (!checked) {
                    setTimeout(() => {
                        if (!isLocalServerOnline) updateGatewayBadge(false);
                    }, 500);
                }
            });
    });
}

function updateGatewayBadge(isOnline) {
    const badge = document.getElementById('gatewayStatusBadge');
    const dot = document.getElementById('gatewayStatusDot');
    const text = document.getElementById('gatewayStatusText');
    if (!badge || !dot || !text) return;
    dot.className = 'w-1.5 h-1.5 rounded-full bg-current';

    if (window.location.protocol.startsWith('http')) {
        // Only the gateway (serve.py, e.g. on this PC or a NAS) gets a badge; the hosted site needs none
        if (!gatewayInfo && !isPrivateHost(window.location.hostname)) {
            badge.className = 'hidden';
            return;
        }
        badge.className = 'hidden sm:inline-flex chip chip-emerald';
        text.innerText = `Local gateway${window.location.port ? ' :' + window.location.port : ''}`;
    } else if (isOnline) {
        badge.className = 'hidden sm:inline-flex chip chip-emerald';
        text.innerText = 'Local gateway :8088';
    } else {
        badge.className = 'hidden sm:inline-flex chip chip-amber cursor-pointer';
        text.innerText = 'file:// mode';
        badge.title = 'Click for info on embedding local files';
        badge.onclick = () => alert('You are running PortalHub directly from a file:// URL. To embed local apps (like PSE) without browser security restrictions, double-click "start_portal.bat" in the Portal folder to launch via http://localhost:8088.');
    }
}

// The gateway API exists only when PortalHub is served by serve.py on this machine or LAN
// Also works behind a reverse-proxy domain; skipped on the Firebase-hosted site, which has no gateway
async function detectGateway() {
    const host = window.location.hostname;
    if (!window.location.protocol.startsWith('http') || /\.(web\.app|firebaseapp\.com)$/i.test(host)) return;
    try {
        const res = await fetch('/api/info', { cache: 'no-store' });
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
            gatewayInfo = await res.json();
            updateGatewayBadge(true);
        }
    } catch(e) {}
}

// ==========================================
// GREETING, VIEW & SORT
// ==========================================
function renderGreeting() {
    const greetingEl = document.getElementById('dashboardGreeting');
    const summaryEl = document.getElementById('dashboardSummary');
    if (greetingEl) {
        const hour = new Date().getHours();
        const partOfDay = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
        const rawName = (currentUser && (currentUser.name || currentUser.email || '')) || '';
        const firstName = rawName.split(/[\s@._]/)[0];
        greetingEl.textContent = firstName
            ? `Good ${partOfDay}, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}`
            : `Good ${partOfDay}`;
    }
    if (summaryEl) {
        const dashboardApps = getDashboardApps();
        const pinnedCount = dashboardApps.filter(a => a.pinned).length;
        const dashboardName = getActiveDashboard().name;
        if (apps.length === 0) {
            summaryEl.textContent = 'Add your first service to get started.';
        } else if (dashboardApps.length === 0) {
            summaryEl.textContent = `Nothing on ${dashboardName} yet.`;
        } else {
            summaryEl.textContent = `${dashboardApps.length} service${dashboardApps.length === 1 ? '' : 's'} on ${dashboardName}` +
                (pinnedCount ? ` · ${pinnedCount} pinned` : '');
        }
    }
}

function setViewType(type) {
    if (!VIEW_TYPES.includes(type)) return;
    currentViewType = type;
    localStorage.setItem(STORAGE_KEYS.view, type);
    renderDashboard();
}

function updateViewTypeUI() {
    const buttons = { grid: 'viewGridBtn', list: 'viewListBtn', carousel: 'viewCarouselBtn' };
    VIEW_TYPES.forEach(type => {
        const btn = document.getElementById(buttons[type]);
        if (!btn) return;
        const active = currentViewType === type;
        btn.setAttribute('aria-pressed', String(active));
        btn.classList.toggle('!bg-[var(--surface-hover)]', active);
        btn.classList.toggle('!text-[var(--text)]', active);
        btn.classList.toggle('shadow-sm', active);
    });
}

function setSortMode(mode) {
    if (!SORT_LABELS[mode]) return;
    sortMode = mode;
    localStorage.setItem(STORAGE_KEYS.sort, mode);
    renderDashboard();
}

function updateSortUI() {
    const select = document.getElementById('sortSelect');
    if (select) select.value = sortMode;
}

// ==========================================
// DASHBOARDS (Home / Work / Family …)
// ==========================================
function renderDashboardTabs() {
    const nav = document.getElementById('dashboardTabs');
    if (!nav) return;
    nav.innerHTML = dashboards.map(d => {
        const selected = d.id === activeDashboardId;
        const count = apps.filter(a => a.dashboardId === d.id).length;
        return `
            <button type="button" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-dashboard-id="${escapeHtml(d.id)}"
                onclick="switchDashboard(${jsArg(d.id)})" onkeydown="handleDashboardTabKeydown(event)" class="dash-tab">
                <i class="fa-solid ${escapeHtml(d.icon)} text-xs" aria-hidden="true"></i>
                <span>${escapeHtml(d.name)}</span>
                <span class="count">${count}</span>
            </button>
        `;
    }).join('') + `
        <button type="button" onclick="addDashboard()" class="dash-tab !px-2.5" aria-label="New dashboard" title="New dashboard">
            <i class="fa-solid fa-plus text-xs" aria-hidden="true"></i>
        </button>
    `;
}

function handleDashboardTabKeydown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = dashboards.findIndex(d => d.id === activeDashboardId);
    const next = dashboards[(index + (e.key === 'ArrowRight' ? 1 : -1) + dashboards.length) % dashboards.length];
    switchDashboard(next.id);
    document.querySelector('#dashboardTabs [aria-selected="true"]')?.focus();
}

function switchDashboard(id) {
    if (!dashboards.some(d => d.id === id)) return;
    activeDashboardId = id;
    localStorage.setItem(STORAGE_KEYS.activeDashboard, id);
    selectedCategories.clear();
    selectedTags.clear();
    carouselActiveIndex = 0;
    renderDashboard();
    document.getElementById('dashboardHomeView')?.scrollTo({ top: 0 });
}

function pickDashboardIcon(name) {
    const hint = DASHBOARD_ICON_HINTS.find(([pattern]) => pattern.test(name));
    return hint ? hint[1] : 'fa-table-cells-large';
}

async function addDashboard() {
    const name = await askText({ title: 'New dashboard', label: 'Name', placeholder: 'e.g. Media', confirmText: 'Create' });
    if (!name) return;
    if (dashboards.some(d => d.name.toLowerCase() === name.toLowerCase())) {
        showToast('A dashboard with that name already exists', { error: true });
        return;
    }
    let id = slugify(name);
    while (dashboards.some(d => d.id === id)) id = `${slugify(name)}-${Math.random().toString(36).slice(2, 5)}`;
    dashboards.push({ id, name, icon: pickDashboardIcon(name) });
    saveDashboards();
    switchDashboard(id);
    renderSettingsDashboardList();
    showToast(`Created ${name}`);
}

async function renameDashboard(id) {
    const dashboard = dashboards.find(d => d.id === id);
    if (!dashboard) return;
    const name = await askText({ title: 'Rename dashboard', label: 'Name', value: dashboard.name, confirmText: 'Rename' });
    if (!name || name === dashboard.name) return;
    if (dashboards.some(d => d.id !== id && d.name.toLowerCase() === name.toLowerCase())) {
        showToast('A dashboard with that name already exists', { error: true });
        return;
    }
    dashboard.name = name;
    saveDashboards();
    renderDashboard();
    renderSettingsDashboardList();
}

async function deleteDashboard(id) {
    const dashboard = dashboards.find(d => d.id === id);
    if (!dashboard || dashboards.length <= 1) return;
    const fallback = dashboards.find(d => d.id !== id);
    const count = apps.filter(a => a.dashboardId === id).length;
    const confirmed = await askChoice({
        title: `Delete ${dashboard.name}?`,
        message: count ? `Its ${count} app${count === 1 ? '' : 's'} will move to ${fallback.name}.` : 'This dashboard is empty.',
        confirmText: 'Delete dashboard',
        danger: true
    });
    if (!confirmed) return;
    apps.forEach(a => { if (a.dashboardId === id) a.dashboardId = fallback.id; });
    dashboards = dashboards.filter(d => d.id !== id);
    if (activeDashboardId === id) {
        activeDashboardId = fallback.id;
        localStorage.setItem(STORAGE_KEYS.activeDashboard, fallback.id);
    }
    saveApps();
    saveDashboards();
    renderDashboard();
    renderSettingsDashboardList();
    showToast(`Deleted ${dashboard.name}`);
}

function moveAppToDashboard(appId, dashboardId) {
    const app = apps.find(a => a.id === appId);
    const target = dashboards.find(d => d.id === dashboardId);
    if (!app || !target) return;
    app.dashboardId = target.id;
    saveApps();
    renderDashboard();
    showToast(`Moved ${app.name} to ${target.name}`, { action: 'Go there', onAction: () => switchDashboard(target.id) });
}

// ==========================================
// FILTERING & SORTING
// ==========================================
function getDashboardApps(dashboardId = activeDashboardId) {
    return apps.filter(a => a.dashboardId === dashboardId);
}

function hasActiveFilters() {
    return selectedCategories.size > 0 || selectedTags.size > 0 || searchQuery.trim() !== '';
}

function appSearchText(app) {
    return [app.name, app.url, app.category, app.description, getDashboardName(app.dashboardId), ...app.tags.map(t => '#' + t)].join(' ').toLowerCase();
}

function sortAppList(list) {
    const last = app => (usage[app.id] && usage[app.id].last) || 0;
    const count = app => (usage[app.id] && usage[app.id].count) || 0;
    // Array#sort is stable, so ties keep the custom (drag) order
    if (sortMode === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (sortMode === 'recent') return [...list].sort((a, b) => last(b) - last(a));
    if (sortMode === 'frequent') return [...list].sort((a, b) => count(b) - count(a));
    return list;
}

function getFilteredApps() {
    let list = getDashboardApps();
    if (selectedCategories.size) list = list.filter(a => selectedCategories.has(a.category));
    if (selectedTags.size) list = list.filter(a => a.tags.some(t => selectedTags.has(t)));
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length) list = list.filter(a => {
        const text = appSearchText(a);
        return tokens.every(token => text.includes(token));
    });
    return sortAppList(list);
}

// Carousel shows pinned apps first, like the grid's Pinned block
function getCarouselApps() {
    const list = getFilteredApps();
    return [...list.filter(a => a.pinned), ...list.filter(a => !a.pinned)];
}

function renderFilterBar() {
    const bar = document.getElementById('filterBar');
    if (!bar) return;
    const dashboardApps = getDashboardApps();
    if (!dashboardApps.length) {
        bar.innerHTML = '';
        bar.classList.add('hidden');
        return;
    }
    bar.classList.remove('hidden');

    const usedCategories = [...new Set([...categories, ...dashboardApps.map(a => a.category)])]
        .filter(c => dashboardApps.some(a => a.category === c) || selectedCategories.has(c));
    const tagCounts = new Map();
    dashboardApps.forEach(a => a.tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
    selectedTags.forEach(t => { if (!tagCounts.has(t)) tagCounts.set(t, 0); });
    const tags = [...tagCounts.keys()].sort();
    const noChips = !selectedCategories.size && !selectedTags.size;

    let html = `<button type="button" class="filter-chip" aria-pressed="${noChips}" onclick="clearChipFilters()">All <span class="opacity-60">${dashboardApps.length}</span></button>`;
    html += usedCategories.map(c => `
        <button type="button" class="filter-chip" aria-pressed="${selectedCategories.has(c)}" onclick="toggleCategoryFilter(${jsArg(c)})">
            ${escapeHtml(c)} <span class="opacity-60">${dashboardApps.filter(a => a.category === c).length}</span>
        </button>
    `).join('');
    if (tags.length) {
        html += '<span class="w-px h-5 bg-[var(--border-strong)] mx-1 shrink-0" aria-hidden="true"></span>';
        html += tags.map(t => `
            <button type="button" class="filter-chip is-tag" aria-pressed="${selectedTags.has(t)}" onclick="toggleTagFilter(${jsArg(t)})">#${escapeHtml(t)}</button>
        `).join('');
    }
    if (hasActiveFilters()) {
        html += '<button type="button" onclick="clearFilters()" class="filter-chip !border-transparent !bg-transparent !text-[var(--accent-text)]">Clear filters</button>';
    }
    bar.innerHTML = html;
}

function toggleCategoryFilter(category) {
    if (selectedCategories.has(category)) selectedCategories.delete(category);
    else selectedCategories.add(category);
    carouselActiveIndex = 0;
    renderDashboard();
}

function toggleTagFilter(tag) {
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    carouselActiveIndex = 0;
    renderDashboard();
}

function clearChipFilters() {
    selectedCategories.clear();
    selectedTags.clear();
    carouselActiveIndex = 0;
    renderDashboard();
}

// Reset search, category and tag filters together
function clearFilters() {
    const input = document.getElementById('dashboardSearchInput');
    if (input) input.value = '';
    searchQuery = '';
    syncSearchControls();
    clearChipFilters();
}

function syncSearchControls() {
    const clearBtn = document.getElementById('clearSearchBtn');
    const hint = document.getElementById('searchShortcutHint');
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !searchQuery);
        clearBtn.classList.toggle('flex', !!searchQuery);
    }
    if (hint) hint.classList.toggle('invisible', !!searchQuery);
}

function handleSearch(value) {
    searchQuery = value || '';
    syncSearchControls();
    carouselActiveIndex = 0;
    renderFilterBar();
    renderAppBlocks();
}

function clearSearch() {
    const input = document.getElementById('dashboardSearchInput');
    if (input) input.value = '';
    handleSearch('');
}

// Enter opens the first match; Escape clears the search
function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const first = currentViewType === 'carousel' ? getCarouselApps()[0] : getFilteredApps()[0];
        if (first) launchApp(first.id);
    } else if (e.key === 'Escape') {
        e.stopPropagation();
        if (searchQuery) clearSearch();
        else e.target.blur();
    }
}

// ==========================================
// RENDERING: blocks, cards, empty states
// ==========================================
function renderDashboard() {
    renderGreeting();
    renderDashboardTabs();
    renderFilterBar();
    updateViewTypeUI();
    updateSortUI();
    renderAppBlocks();
}

function appIconHtml(app, sizeClass = 'w-11 h-11', textClass = 'text-lg') {
    const fallback = `
        <span class="icon-tile ${sizeClass} bg-gradient-to-br ${escapeHtml(app.color)} ${app.favicon ? 'hidden' : ''}">
            <i class="fa-solid ${escapeHtml(app.icon)} ${textClass}" aria-hidden="true"></i>
        </span>`;
    if (!app.favicon) return fallback;
    // If the site icon fails to load, swap in the gradient icon
    return `
        <span class="icon-tile icon-tile-image ${sizeClass}">
            <img src="${escapeHtml(app.favicon)}" alt="" loading="lazy" referrerpolicy="no-referrer"
                onerror="this.parentElement.classList.add('hidden'); this.parentElement.nextElementSibling.classList.remove('hidden');">
        </span>${fallback}`;
}

function tagChipsHtml(app, max) {
    if (!app.tags.length) return '';
    const shown = app.tags.slice(0, max).map(t => `<span class="chip chip-tag">#${escapeHtml(t)}</span>`).join('');
    const more = app.tags.length > max
        ? `<span class="chip chip-tag" title="${escapeHtml(app.tags.slice(max).map(t => '#' + t).join(' '))}">+${app.tags.length - max}</span>`
        : '';
    return shown + more;
}

function cardActionsHtml(app) {
    return `
        <div class="card-actions flex items-center shrink-0" onclick="event.stopPropagation()">
            <button type="button" onclick="togglePin(${jsArg(app.id)})" class="icon-btn w-8 h-8" aria-pressed="${app.pinned}"
                aria-label="${app.pinned ? 'Unpin' : 'Pin'} ${escapeHtml(app.name)}" title="${app.pinned ? 'Unpin' : 'Pin to top'}">
                <i class="fa-solid fa-thumbtack text-xs" aria-hidden="true"></i>
            </button>
            <button type="button" onclick="openCardMenu(event, ${jsArg(app.id)})" class="icon-btn w-8 h-8" aria-haspopup="menu" aria-expanded="false"
                aria-label="More actions for ${escapeHtml(app.name)}" title="More actions">
                <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
            </button>
        </div>`;
}

function newTabIndicator(app) {
    return opensInNewTab(app)
        ? '<i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-muted shrink-0" title="Opens in a new tab" aria-label="opens in a new tab"></i>'
        : '';
}

function gridCardHtml(app) {
    return `
        <article data-app-id="${escapeHtml(app.id)}" tabindex="0" aria-label="${escapeHtml(app.name)}"
            onclick="handleCardClick(${jsArg(app.id)})" onkeydown="handleCardKeydown(event, ${jsArg(app.id)})"
            oncontextmenu="openCardMenu(event, ${jsArg(app.id)})" class="app-card group">
            <div class="flex items-start justify-between gap-3">
                ${appIconHtml(app)}
                ${cardActionsHtml(app)}
            </div>
            <h3 class="mt-4 font-semibold text-[15px] leading-snug flex items-center gap-1.5 min-w-0">
                <span class="truncate">${escapeHtml(app.name)}</span>${newTabIndicator(app)}
            </h3>
            <p class="mt-1 text-sm text-muted line-clamp-2 leading-relaxed">${escapeHtml(app.description)}</p>
            <div class="mt-auto pt-4">
                <div class="pt-3 border-t border-token flex items-center gap-1.5 min-w-0">
                    <span class="font-mono text-[11px] text-muted truncate flex-1 min-w-0" title="${escapeHtml(app.url)}">${escapeHtml(displayUrl(app.url))}</span>
                    <span class="chip chip-neutral">${escapeHtml(app.category)}</span>
                </div>
                ${app.tags.length ? `<div class="mt-2 flex flex-wrap gap-1">${tagChipsHtml(app, 3)}</div>` : ''}
            </div>
        </article>`;
}

function listRowHtml(app) {
    return `
        <article data-app-id="${escapeHtml(app.id)}" tabindex="0" aria-label="${escapeHtml(app.name)}"
            onclick="handleCardClick(${jsArg(app.id)})" onkeydown="handleCardKeydown(event, ${jsArg(app.id)})"
            oncontextmenu="openCardMenu(event, ${jsArg(app.id)})" class="app-row group">
            ${appIconHtml(app, 'w-9 h-9', 'text-sm')}
            <div class="min-w-0 flex-1 sm:flex-none sm:w-56 lg:w-64">
                <div class="font-semibold text-sm flex items-center gap-1.5 min-w-0"><span class="truncate">${escapeHtml(app.name)}</span>${newTabIndicator(app)}</div>
                <div class="font-mono text-[11px] text-muted truncate" title="${escapeHtml(app.url)}">${escapeHtml(displayUrl(app.url))}</div>
            </div>
            <p class="hidden lg:block flex-1 min-w-0 text-sm text-muted truncate">${escapeHtml(app.description)}</p>
            <div class="hidden md:flex items-center gap-1 shrink-0 ml-auto">
                ${tagChipsHtml(app, 2)}
                <span class="chip chip-neutral">${escapeHtml(app.category)}</span>
            </div>
            ${cardActionsHtml(app)}
        </article>`;
}

function blockHtml(blockId, title, icon, list, { showHint = true } = {}) {
    const collapsed = collapsedBlocks.has(blockId);
    const containerClass = currentViewType === 'list' ? 'app-list' : 'app-grid';
    const items = list.map(app => currentViewType === 'list' ? listRowHtml(app) : gridCardHtml(app)).join('');
    const emptyHint = blockId === 'pinned'
        ? '<div class="drop-hint"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Drag a card here, or use <i class="fa-solid fa-ellipsis" aria-hidden="true"></i> › Pin to top</div>'
        : '<div class="drop-hint">Drag a card here to unpin it</div>';
    const hint = sortMode === 'custom'
        ? '<span class="hidden sm:inline text-[11px] text-muted">Drag to reorder · Alt + arrows with keyboard</span>'
        : `<span class="text-[11px] text-muted">Sorted: ${SORT_LABELS[sortMode]}</span>`;
    return `
        <section data-block="${blockId}" aria-labelledby="block-${blockId}-title">
            <div class="flex items-center justify-between gap-3 mb-3">
                <button type="button" id="block-${blockId}-title" class="block-toggle" aria-expanded="${!collapsed}" aria-controls="block-${blockId}-body" onclick="toggleBlock('${blockId}')">
                    <i class="chev fa-solid fa-chevron-down text-[10px]" aria-hidden="true"></i>
                    <i class="fa-solid ${icon} ${blockId === 'pinned' ? 'text-emerald' : 'text-accent'}" aria-hidden="true"></i>
                    <span>${title}</span>
                    <span class="chip chip-neutral !normal-case !tracking-normal">${list.length}</span>
                </button>
                ${showHint && list.length > 1 && !collapsed ? hint : ''}
            </div>
            <div id="block-${blockId}-body" class="${containerClass} ${collapsed ? 'hidden' : ''}" data-sortable-block="${blockId}">
                ${items || emptyHint}
            </div>
        </section>`;
}

function emptyStateHtml({ icon, title, body, actions }) {
    return `
        <div class="glass rounded-3xl py-14 px-6 text-center">
            <div class="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-accent flex items-center justify-center mx-auto mb-4 text-xl">
                <i class="fa-solid ${icon}" aria-hidden="true"></i>
            </div>
            <h2 class="font-semibold text-base">${title}</h2>
            <p class="text-sm text-muted mt-1 mb-5 max-w-md mx-auto">${body}</p>
            <div class="flex flex-wrap items-center justify-center gap-2">${actions}</div>
        </div>`;
}

function renderAppBlocks() {
    const blocksEl = document.getElementById('dashboardBlocks');
    const carouselWrapper = document.getElementById('mainAppCarouselWrapper');
    if (!blocksEl || !carouselWrapper) return;
    const dashboardApps = getDashboardApps();
    const filtered = getFilteredApps();

    if (currentViewType === 'carousel' && filtered.length) {
        destroySortables();
        blocksEl.innerHTML = '';
        blocksEl.classList.add('hidden');
        carouselWrapper.classList.remove('hidden');
        renderCarouselView(getCarouselApps());
        return;
    }
    carouselWrapper.classList.add('hidden');
    blocksEl.classList.remove('hidden');
    destroySortables();

    if (!dashboardApps.length) {
        const dashboardName = escapeHtml(getActiveDashboard().name);
        blocksEl.innerHTML = apps.length === 0
            ? emptyStateHtml({
                icon: 'fa-plus',
                title: 'No services yet',
                body: 'Add the apps and dashboards you use most, then open them from here.',
                actions: '<button type="button" onclick="openAddAppModal()" class="btn btn-primary h-10">Add app</button><button type="button" onclick="loadSampleApps()" class="btn btn-ghost h-10">Load samples</button>'
            })
            : emptyStateHtml({
                icon: 'fa-table-cells-large',
                title: `Nothing on ${dashboardName} yet`,
                body: `Add an app here, or move one from another dashboard with its <i class="fa-solid fa-ellipsis"></i> menu.`,
                actions: '<button type="button" onclick="openAddAppModal()" class="btn btn-primary h-10">Add app</button>'
            });
        return;
    }
    if (!filtered.length) {
        const query = searchQuery.trim();
        blocksEl.innerHTML = emptyStateHtml({
            icon: 'fa-magnifying-glass',
            title: 'No matching services',
            body: query ? `Nothing on this dashboard matches “${escapeHtml(query)}”. Press Ctrl K to search every dashboard.` : 'No apps match the selected filters.',
            actions: '<button type="button" onclick="clearFilters()" class="btn btn-ghost h-10">Clear filters</button>'
        });
        return;
    }

    const pinned = filtered.filter(a => a.pinned);
    const others = filtered.filter(a => !a.pinned);
    const canDrag = sortMode === 'custom';
    let html = '';
    if (pinned.length || (canDrag && !hasActiveFilters())) html += blockHtml('pinned', 'Pinned', 'fa-thumbtack', pinned);
    if (others.length || (canDrag && pinned.length)) html += blockHtml('services', pinned.length ? 'All services' : 'Services', 'fa-cubes', others, { showHint: !html || pinned.length < 2 });
    blocksEl.innerHTML = html;
    setupSortables();
}

function toggleBlock(blockId) {
    if (collapsedBlocks.has(blockId)) collapsedBlocks.delete(blockId);
    else collapsedBlocks.add(blockId);
    writeStored(STORAGE_KEYS.collapsedBlocks, [...collapsedBlocks]);
    renderAppBlocks();
    document.getElementById(`block-${blockId}-title`)?.focus();
}

// ==========================================
// CARD INTERACTIONS: open, pin, reorder (drag, keyboard, menu)
// ==========================================
let sortables = [];
let suppressCardClickUntil = 0;

function handleCardClick(appId) {
    // A drag ends with a click on some browsers; ignore it
    if (Date.now() < suppressCardClickUntil) return;
    launchApp(appId);
}

function handleCardKeydown(e, appId) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launchApp(appId);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        moveApp(appId, -1);
    } else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
        e.preventDefault();
        moveApp(appId, 1);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const trigger = e.currentTarget.querySelector('[aria-haspopup="menu"]');
        if (trigger) trigger.click();
    }
}

function togglePin(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    app.pinned = !app.pinned;
    saveApps();
    renderDashboard();
    showToast(app.pinned ? `Pinned ${app.name}` : `Unpinned ${app.name}`);
}

// Keyboard / menu alternative to dragging: swap with the neighbour in the same block
function moveApp(appId, direction) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    if (sortMode !== 'custom') {
        setSortMode('custom');
        showToast('Switched to custom order so you can arrange apps');
    }
    const siblings = getFilteredApps().filter(a => a.pinned === app.pinned);
    const index = siblings.findIndex(a => a.id === appId);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    const i = apps.indexOf(app);
    const j = apps.indexOf(neighbor);
    [apps[i], apps[j]] = [apps[j], apps[i]];
    saveApps();
    renderDashboard();
    requestAnimationFrame(() => document.querySelector(`[data-app-id="${CSS.escape(appId)}"]`)?.focus());
}

function destroySortables() {
    sortables.forEach(s => s.destroy());
    sortables = [];
}

function setupSortables() {
    destroySortables();
    if (!window.Sortable || sortMode !== 'custom') return;
    document.querySelectorAll('[data-sortable-block]').forEach(el => {
        sortables.push(Sortable.create(el, {
            group: 'portal-apps',
            draggable: '[data-app-id]',
            animation: 180,
            easing: 'cubic-bezier(.2,.8,.2,1)',
            delay: 220,
            delayOnTouchOnly: true,
            touchStartThreshold: 6,
            emptyInsertThreshold: 32,
            ghostClass: 'drag-ghost',
            chosenClass: 'drag-chosen',
            dragClass: 'drag-active',
            onEnd: handleSortEnd
        }));
    });
}

function handleSortEnd(evt) {
    suppressCardClickUntil = Date.now() + 300;
    if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

    const idsIn = block => [...document.querySelectorAll(`[data-sortable-block="${block}"] [data-app-id]`)].map(el => el.dataset.appId);
    const pinnedIds = idsIn('pinned');
    const otherIds = idsIn('services');
    const visibleOrder = [...pinnedIds, ...otherIds];
    const visibleSet = new Set(visibleOrder);
    const pinnedSet = new Set(pinnedIds);
    const byId = new Map(apps.map(a => [a.id, a]));

    // Refill the slots the visible apps occupy, so hidden (filtered-out) apps keep their positions
    let cursor = 0;
    apps = apps.map(a => (visibleSet.has(a.id) ? byId.get(visibleOrder[cursor++]) : a));
    apps.forEach(a => { if (visibleSet.has(a.id)) a.pinned = pinnedSet.has(a.id); });
    saveApps();

    const moved = byId.get(evt.item.dataset.appId);
    if (evt.from !== evt.to && moved) showToast(moved.pinned ? `Pinned ${moved.name}` : `Unpinned ${moved.name}`);
    // Re-render after SortableJS finishes its own cleanup
    setTimeout(renderDashboard, 0);
}

// ---------- Card "more" menu ----------
let cardMenuItems = [];
let cardMenuTrigger = null;

function buildCardMenuItems(app) {
    const items = [
        { icon: 'fa-play', label: 'Open', run: () => launchApp(app.id) },
        { icon: 'fa-arrow-up-right-from-square', label: 'Open in new tab', run: () => openAppInNewTab(app.id) }
    ];
    if (canEmbed(app)) items.push({ icon: 'fa-table-columns', label: 'Open side by side…', run: () => startSplitFrom(app.id) });
    items.push({ icon: 'fa-qrcode', label: 'QR code for phone', run: () => openQrModal(app.id) });
    items.push('-');
    items.push({ icon: 'fa-thumbtack', label: app.pinned ? 'Unpin' : 'Pin to top', run: () => togglePin(app.id) });
    const siblings = getFilteredApps().filter(a => a.pinned === app.pinned);
    const index = siblings.findIndex(a => a.id === app.id);
    items.push({ icon: 'fa-arrow-up', label: 'Move earlier', hint: 'Alt ↑', disabled: index <= 0, run: () => moveApp(app.id, -1) });
    items.push({ icon: 'fa-arrow-down', label: 'Move later', hint: 'Alt ↓', disabled: index === -1 || index >= siblings.length - 1, run: () => moveApp(app.id, 1) });
    dashboards.filter(d => d.id !== app.dashboardId).forEach(d => {
        items.push({ icon: d.icon, label: `Move to ${d.name}`, run: () => moveAppToDashboard(app.id, d.id) });
    });
    items.push('-');
    items.push({ icon: 'fa-pen', label: 'Edit', run: () => openEditAppModal(app.id) });
    items.push({ icon: 'fa-trash', label: 'Delete', danger: true, run: () => deleteApp(app.id) });
    return items;
}

function openCardMenu(event, appId) {
    event.preventDefault();
    event.stopPropagation();
    const app = apps.find(a => a.id === appId);
    const menu = document.getElementById('cardMenu');
    if (!app || !menu) return;

    const fromButton = event.type === 'click';
    const trigger = fromButton ? event.currentTarget : null;
    if (isOpen('cardMenu') && trigger && trigger === cardMenuTrigger) {
        closeCardMenu({ restoreFocus: true });
        return;
    }
    closeCardMenu();

    cardMenuItems = buildCardMenuItems(app);
    cardMenuTrigger = trigger || event.currentTarget;
    menu.setAttribute('aria-label', `Actions for ${app.name}`);
    menu.innerHTML = cardMenuItems.map((item, i) => item === '-'
        ? '<div class="h-px bg-[var(--border)] my-1" role="separator"></div>'
        : `<button type="button" role="menuitem" class="menu-item ${item.danger ? 'is-danger' : ''}" ${item.disabled ? 'disabled' : ''} onclick="runCardMenuItem(${i})">
                <i class="fa-solid ${escapeHtml(item.icon)}" aria-hidden="true"></i>
                <span class="flex-1 truncate">${escapeHtml(item.label)}</span>
                ${item.hint ? `<span class="text-[11px] text-muted font-mono">${item.hint}</span>` : ''}
            </button>`
    ).join('');
    menu.classList.remove('hidden');

    // Position: below the ⋯ button, or at the pointer for right-click
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left, top;
    if (trigger) {
        const rect = trigger.getBoundingClientRect();
        left = rect.right - width;
        top = rect.bottom + 6;
        if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.closest('.card-actions')?.classList.add('is-open');
    } else {
        left = event.clientX;
        top = event.clientY;
    }
    menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    menu.querySelector('button:not([disabled])')?.focus();
}

function closeCardMenu({ restoreFocus = false } = {}) {
    const menu = document.getElementById('cardMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    if (cardMenuTrigger) {
        if (cardMenuTrigger.getAttribute('aria-expanded')) cardMenuTrigger.setAttribute('aria-expanded', 'false');
        cardMenuTrigger.closest('.card-actions')?.classList.remove('is-open');
        if (restoreFocus) cardMenuTrigger.focus();
    }
    cardMenuTrigger = null;
}

function runCardMenuItem(index) {
    const item = cardMenuItems[index];
    closeCardMenu();
    if (item && item.run) item.run();
}

function handleCardMenuKeydown(e) {
    const buttons = [...document.querySelectorAll('#cardMenu button:not([disabled])')];
    const index = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
        if (next) next.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        (e.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.focus();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCardMenu({ restoreFocus: true });
    } else if (e.key === 'Tab') {
        closeCardMenu();
    }
}

// ==========================================
// 3D CAROUSEL (Cover Flow) VIEW
// ==========================================
function renderCarouselView(list) {
    const track = document.getElementById('carouselCardsTrack');
    const dotsContainer = document.getElementById('carouselIndicatorDots');
    if (!track) return;
    if (carouselActiveIndex >= list.length) carouselActiveIndex = list.length - 1;
    if (carouselActiveIndex < 0) carouselActiveIndex = 0;

    track.innerHTML = list.map((app, i) => `
        <div id="carousel-card-${i}" data-index="${i}" onclick="handleCarouselCardClick(${i})" class="carousel-3d-card">
            <div class="h-full glass-strong rounded-3xl p-5 flex flex-col">
                <div class="flex items-center justify-between gap-2">
                    <span class="chip chip-neutral">${escapeHtml(app.category)}</span>
                    ${app.pinned ? '<span class="chip chip-emerald"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Pinned</span>' : ''}
                </div>
                <div class="flex-1 flex flex-col items-center justify-center text-center min-h-0">
                    ${appIconHtml(app, 'w-20 h-20 !rounded-2xl', 'text-3xl')}
                    <h3 class="mt-4 font-semibold text-xl tracking-tight">${escapeHtml(app.name)}</h3>
                    <span class="font-mono text-xs text-muted truncate max-w-[240px] mt-1" title="${escapeHtml(app.url)}">${escapeHtml(displayUrl(app.url))}</span>
                    <p class="text-sm text-muted line-clamp-2 mt-3 px-2">${escapeHtml(app.description)}</p>
                </div>
                <div class="pt-3 border-t border-token flex items-center gap-2" onclick="event.stopPropagation()">
                    <button type="button" onclick="launchApp(${jsArg(app.id)})" class="btn btn-primary flex-1 h-10">
                        <i class="fa-solid fa-play text-[10px]" aria-hidden="true"></i> Open
                    </button>
                    <button type="button" onclick="openAppInNewTab(${jsArg(app.id)})" class="btn btn-ghost h-10 w-10 !px-0" aria-label="Open ${escapeHtml(app.name)} in new tab" title="Open in new tab">
                        <i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    if (dotsContainer) {
        dotsContainer.innerHTML = list.map((a, i) => `
            <button type="button" onclick="selectCarouselIndex(${i})" aria-label="Show ${escapeHtml(a.name)}" title="${escapeHtml(a.name)}"></button>
        `).join('');
    }
    updateCarouselCardsTransform(list);
}

function prevCarouselSlide() {
    const filteredApps = getCarouselApps();
    if (filteredApps.length === 0) return;
    if (carouselActiveIndex > 0) {
        carouselActiveIndex--;
    } else {
        carouselActiveIndex = filteredApps.length - 1;
    }
    updateCarouselCardsTransform(filteredApps);
}

function nextCarouselSlide() {
    const filteredApps = getCarouselApps();
    if (filteredApps.length === 0) return;
    if (carouselActiveIndex < filteredApps.length - 1) {
        carouselActiveIndex++;
    } else {
        carouselActiveIndex = 0;
    }
    updateCarouselCardsTransform(filteredApps);
}

function selectCarouselIndex(idx) {
    const filteredApps = getCarouselApps();
    if (idx >= 0 && idx < filteredApps.length) {
        carouselActiveIndex = idx;
        updateCarouselCardsTransform(filteredApps);
    }
}

function handleCarouselCardClick(idx) {
    if (idx !== carouselActiveIndex) {
        selectCarouselIndex(idx);
    }
}

function updateCarouselCardsTransform(filteredApps) {
    if (!filteredApps) filteredApps = getCarouselApps();
    if (filteredApps.length === 0) return;

    if (carouselActiveIndex >= filteredApps.length) carouselActiveIndex = filteredApps.length - 1;
    if (carouselActiveIndex < 0) carouselActiveIndex = 0;

    const counterEl = document.getElementById('carouselActiveCounter');
    if (counterEl) counterEl.innerText = `Service ${carouselActiveIndex + 1} of ${filteredApps.length}`;

    const catEl = document.getElementById('carouselActiveCategory');
    if (catEl && filteredApps[carouselActiveIndex]) {
        catEl.innerText = filteredApps[carouselActiveIndex].category;
    }

    const dotsContainer = document.getElementById('carouselIndicatorDots');
    if (dotsContainer) {
        Array.from(dotsContainer.children).forEach((dot, idx) => {
            const isActive = idx === carouselActiveIndex;
            dot.className = `shrink-0 rounded-full transition-all duration-300 ${isActive ? 'w-7 h-2 bg-[var(--accent)] shadow-[0_0_10px_rgb(47_123_255/0.7)]' : 'w-2 h-2 bg-[var(--border-strong)] hover:bg-[var(--text-muted)]'}`;
            dot.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
    }

    const track = document.getElementById('carouselCardsTrack');
    if (!track) return;
    const cardEls = track.querySelectorAll('.carousel-3d-card');
    cardEls.forEach(card => {
        const idx = parseInt(card.getAttribute('data-index'), 10);
        const offset = idx - carouselActiveIndex;
        const absOffset = Math.abs(offset);

        let transform = '';
        let zIndex = 40 - absOffset;
        let opacity = 1;
        let brightness = 1;

        if (offset === 0) {
            // Center active card: facing viewer, elevated, deep shadow
            transform = 'translateX(0px) translateZ(80px) rotateY(0deg) scale(1.04)';
            zIndex = 60;
            opacity = 1;
            card.style.filter = 'drop-shadow(0 25px 25px rgba(0,0,0,0.3))';
        } else if (offset < 0) {
            // Left cards
            const shiftX = (offset * 165) - 80;
            const shiftZ = -100 - (absOffset * 50);
            const scale = Math.max(0.65, 1 - (absOffset * 0.08));
            transform = `translateX(${shiftX}px) translateZ(${shiftZ}px) rotateY(42deg) scale(${scale})`;
            opacity = Math.max(0.16, 1 - (absOffset * 0.22));
            brightness = Math.max(0.42, 1 - (absOffset * 0.16));
            card.style.filter = `brightness(${brightness})`;
        } else {
            // Right cards
            const shiftX = (offset * 165) + 80;
            const shiftZ = -100 - (absOffset * 50);
            const scale = Math.max(0.65, 1 - (absOffset * 0.08));
            transform = `translateX(${shiftX}px) translateZ(${shiftZ}px) rotateY(-42deg) scale(${scale})`;
            opacity = Math.max(0.16, 1 - (absOffset * 0.22));
            brightness = Math.max(0.42, 1 - (absOffset * 0.16));
            card.style.filter = `brightness(${brightness})`;
        }

        card.style.transform = transform;
        card.style.zIndex = zIndex;
        card.style.opacity = opacity;
    });
}

let carouselEventsBound = false;

function setupCarouselEventListeners() {
    if (carouselEventsBound) return;
    const stage = document.getElementById('carousel3dContainer');
    if (!stage) return;
    carouselEventsBound = true;

    let isPointerDown = false;
    let startX = 0;
    let deltaX = 0;

    stage.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        isPointerDown = true;
        startX = e.clientX;
        deltaX = 0;
    });

    stage.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        deltaX = e.clientX - startX;
    });

    const handlePointerEnd = () => {
        if (!isPointerDown) return;
        isPointerDown = false;
        if (deltaX < -40) {
            nextCarouselSlide();
        } else if (deltaX > 40) {
            prevCarouselSlide();
        }
        deltaX = 0;
    };

    stage.addEventListener('pointerup', handlePointerEnd);
    stage.addEventListener('pointercancel', handlePointerEnd);

    // Smooth Wheel Navigation
    let wheelTimer = null;
    stage.addEventListener('wheel', (e) => {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) > 12) {
            e.preventDefault();
            if (wheelTimer) return;
            if (delta > 0) {
                nextCarouselSlide();
            } else {
                prevCarouselSlide();
            }
            wheelTimer = setTimeout(() => { wheelTimer = null; }, 240);
        }
    }, { passive: false });

    // Keyboard navigation (ArrowLeft / ArrowRight)
    window.addEventListener('keydown', (e) => {
        if (currentViewType !== 'carousel') return;
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        const dashboard = document.getElementById('dashboardHomeView');
        if (!dashboard || dashboard.classList.contains('hidden')) return;
        if (isAnyOverlayOpen()) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevCarouselSlide();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextCarouselSlide();
        } else if (e.key === 'Enter' && (!document.activeElement || document.activeElement === document.body)) {
            const filteredApps = getCarouselApps();
            if (filteredApps[carouselActiveIndex]) {
                launchApp(filteredApps[carouselActiveIndex].id);
            }
        }
    });
}

// ==========================================
// APP MODE: launch, full screen, split view
// ==========================================
function openAppInNewTab(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    // Local paths are routed through the gateway; everything else opens as entered
    const url = isLocalFileUrl(app.url) ? getEmbeddableUrl(app.url) : resolveLoopbackAddress(app.url);
    window.open(url, '_blank', 'noopener');
    noteAppOpened(app);
    renderDashboardIfVisible();
    showToast(`Opened ${app.name} in a new tab`);
}

function renderDashboardIfVisible() {
    // Keep "recently used" ordering fresh without re-rendering under an open app
    if (!currentActiveApp && sortMode !== 'custom') renderAppBlocks();
}

function launchApp(appId, { countOpen = true } = {}) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;

    // Configured for a new tab, or an http service the secure (https) portal can't frame
    if (opensInNewTab(app)) {
        openAppInNewTab(app.id);
        return;
    }

    closeCardMenu();
    currentActiveApp = app;
    if (countOpen) noteAppOpened(app);
    if (splitApp && splitApp.id === app.id) closeSplitPane('b');

    document.body.classList.add('app-fullscreen-mode');
    document.getElementById('appDock').classList.add('dock-collapsed');
    document.getElementById('dashboardHomeView').classList.add('hidden');
    document.getElementById('activeAppView').classList.remove('hidden');
    document.title = `${app.name} · PortalHub`;

    const embedUrl = getEmbeddableUrl(app.url);
    const iframe = document.getElementById('serviceIframe');
    const simulatedContainer = document.getElementById('simulatedAppContainer');
    const securityBanner = document.getElementById('iframeSecurityBanner');
    const blockedDomainSpan = document.getElementById('blockedDomainName');

    if (isKnownIframeBlocked(app.url)) {
        if (blockedDomainSpan) {
            try {
                blockedDomainSpan.innerText = new URL(embedUrl).hostname;
            } catch(e) {
                blockedDomainSpan.innerText = app.url;
            }
        }
        securityBanner.classList.remove('hidden');
        iframe.classList.add('hidden');
        simulatedContainer.classList.remove('hidden');
        renderBlockedSiteGateway(app, embedUrl);
    } else if (isLocalFileUrl(app.url) && window.location.protocol === 'file:' && !isLocalServerOnline) {
        securityBanner.classList.add('hidden');
        iframe.classList.add('hidden');
        simulatedContainer.classList.remove('hidden');
        renderLocalFileGateway(app, embedUrl);
    } else {
        securityBanner.classList.add('hidden');
        simulatedContainer.classList.add('hidden');
        iframe.classList.remove('hidden');
        iframe.src = embedUrl;
    }
    renderPaneHeaders();
}

function forceIframeLoad(url) {
    const iframe = document.getElementById('serviceIframe');
    const simulatedContainer = document.getElementById('simulatedAppContainer');
    if (simulatedContainer) simulatedContainer.classList.add('hidden');
    if (iframe) {
        iframe.classList.remove('hidden');
        iframe.src = url;
    }
    const banner = document.getElementById('iframeSecurityBanner');
    if (banner) banner.classList.remove('hidden');
    showToast('Loading URL in frame...');
}

// Explain why a service can't be shown inside PortalHub and offer the alternatives
function renderLaunchNotice(app, embedUrl, notice) {
    const container = document.getElementById('simulatedAppContainer');
    container.innerHTML = `
        <div class="max-w-xl w-full glass-strong !bg-[#0b0d12]/90 !border-white/10 p-6 sm:p-8 rounded-3xl text-center space-y-5 text-slate-200">
            <div class="flex justify-center">${appIconHtml(app, 'w-16 h-16 !rounded-2xl', 'text-2xl')}</div>
            <div>
                <h2 class="text-2xl font-semibold text-white mb-1">${escapeHtml(app.name)}</h2>
                <p class="font-mono text-xs text-[#5b9cff] truncate max-w-md mx-auto">${escapeHtml(app.url)}</p>
            </div>
            <div class="bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-xs text-left space-y-2">
                <div class="flex items-center gap-2 text-amber-300 font-semibold">
                    <i class="fa-solid ${notice.icon}" aria-hidden="true"></i>
                    <span>${notice.title}</span>
                </div>
                ${notice.body}
            </div>
            <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button type="button" onclick="openInNewTab()" class="btn btn-primary w-full sm:w-auto h-10">
                    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    <span>Open in new tab</span>
                </button>
                <button type="button" onclick="forceIframeLoad(${jsArg(embedUrl)})" class="btn w-full sm:w-auto h-10 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200">Try loading here anyway</button>
                <button type="button" onclick="returnToDashboard()" class="btn w-full sm:w-auto h-10 text-slate-400 hover:text-white">Back to dashboard</button>
            </div>
        </div>
    `;
}

function renderBlockedSiteGateway(app, embedUrl) {
    let domainName = app.url;
    try {
        domainName = new URL(embedUrl).hostname;
    } catch(e) {}

    renderLaunchNotice(app, embedUrl, {
        icon: 'fa-shield-halved',
        title: 'This site blocks embedding',
        body: `
            <p class="text-slate-300 leading-relaxed">
                <strong>${escapeHtml(domainName)}</strong> sends <code class="bg-black/50 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[11px]">X-Frame-Options</code>, so browsers won't display it inside another page.
            </p>
            <p class="text-slate-400 leading-relaxed text-[11px]">
                Self-hosted services (Proxmox, Portainer, Home Assistant, Pi-hole, NAS, routers) usually open fine here. To skip this screen, edit the app and set <strong>Open in</strong> to <strong>New browser tab</strong>.
            </p>
        `
    });
}

function renderLocalFileGateway(app, embedUrl) {
    renderLaunchNotice(app, embedUrl, {
        icon: 'fa-triangle-exclamation',
        title: 'Local files need the PortalHub server',
        body: `
            <p class="text-slate-300 leading-relaxed">
                PortalHub was opened from a <code class="bg-black/50 px-1.5 py-0.5 rounded text-amber-300 font-mono text-[11px]">file:///</code> address, and browsers block local files from loading inside each other.
            </p>
            <p class="text-slate-400 leading-relaxed text-[11px]">
                Double-click <code class="bg-black/50 px-1.5 py-0.5 rounded text-[#5b9cff] font-mono text-[11px]">start_portal.bat</code> in the Portal folder, then use <strong class="text-white">http://localhost:8088/Portal/</strong>. Local projects will open here directly.
            </p>
        `
    });
}

function returnToDashboard() {
    closeSplitPane('b');
    document.body.classList.remove('app-fullscreen-mode');
    document.getElementById('activeAppView').classList.add('hidden');
    document.getElementById('dashboardHomeView').classList.remove('hidden');

    const iframe = document.getElementById('serviceIframe');
    if (iframe) iframe.src = 'about:blank';
    const securityBanner = document.getElementById('iframeSecurityBanner');
    if (securityBanner) securityBanner.classList.add('hidden');

    currentActiveApp = null;
    document.title = 'PortalHub';
    renderDashboard();
}

function goToDashboardTop() {
    if (currentActiveApp) returnToDashboard();
    document.getElementById('dashboardHomeView')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// Toggle the right-edge dock in app mode
function toggleAppDockCollapse() {
    const dock = document.getElementById('appDock');
    if (dock) dock.classList.toggle('dock-collapsed');
}

function toggleNativeFullscreen() {
    const icon = document.getElementById('fullscreenIcon');
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        if (icon) icon.className = 'fa-solid fa-compress';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        if (icon) icon.className = 'fa-solid fa-expand';
    }
}

document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('fullscreenIcon');
    if (icon) icon.className = `fa-solid ${document.fullscreenElement ? 'fa-compress' : 'fa-expand'}`;
});

function refreshActiveApp() {
    if (!currentActiveApp) return;
    reloadPane('a');
    if (splitApp) reloadPane('b');
    showToast(`Reloaded ${splitApp ? 'both apps' : currentActiveApp.name}`);
}

function openInNewTab() {
    if (!currentActiveApp) return;
    openAppInNewTab(currentActiveApp.id);
}

// ---------- Split view ----------
let splitRatio = 50;

function startSplitFrom(appId) {
    launchApp(appId);
    if (currentActiveApp && currentActiveApp.id === appId) openCommandPalette('split');
}

function openSplitWith(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app || !currentActiveApp) return;
    if (app.id === currentActiveApp.id) {
        showToast('That app is already open');
        return;
    }
    if (!canEmbed(app)) {
        showToast(`${app.name} can't be shown side by side, so it opened in a new tab`);
        openAppInNewTab(app.id);
        return;
    }
    splitApp = app;
    noteAppOpened(app);
    document.getElementById('activeAppView').classList.add('is-split');
    document.getElementById('serviceIframe2').src = getEmbeddableUrl(app.url);
    setSplitRatio(splitRatio);
    renderPaneHeaders();
}

// Closing pane A keeps pane B's app as the single open app
function closeSplitPane(which) {
    const view = document.getElementById('activeAppView');
    if (!splitApp) {
        if (which === 'a') returnToDashboard();
        return;
    }
    const remaining = which === 'a' ? splitApp : null;
    splitApp = null;
    document.getElementById('serviceIframe2').src = 'about:blank';
    view.classList.remove('is-split', 'is-swapped');
    ['paneA', 'paneB'].forEach(id => { document.getElementById(id).style.flexGrow = ''; });
    if (remaining) launchApp(remaining.id, { countOpen: false });
    renderPaneHeaders();
}

function swapSplitPanes() {
    document.getElementById('activeAppView').classList.toggle('is-swapped');
    setSplitRatio(100 - splitRatio);
}

function reloadPane(pane) {
    const app = pane === 'a' ? currentActiveApp : splitApp;
    const iframe = document.getElementById(pane === 'a' ? 'serviceIframe' : 'serviceIframe2');
    if (app && iframe && !iframe.classList.contains('hidden')) {
        iframe.src = 'about:blank';
        setTimeout(() => { iframe.src = getEmbeddableUrl(app.url); }, 30);
    }
}

function paneHeaderHtml(app, pane) {
    const name = escapeHtml(app.name);
    return `
        ${appIconHtml(app, 'w-6 h-6 !rounded-md', 'text-[10px]')}
        <span class="font-semibold truncate">${name}</span>
        <span class="hidden lg:inline font-mono text-[11px] text-muted truncate">${escapeHtml(displayUrl(app.url))}</span>
        <span class="flex-1"></span>
        <button type="button" onclick="reloadPane('${pane}')" class="icon-btn w-8 h-8 shrink-0" aria-label="Reload ${name}" title="Reload"><i class="fa-solid fa-rotate-right text-xs" aria-hidden="true"></i></button>
        <button type="button" onclick="swapSplitPanes()" class="icon-btn w-8 h-8 shrink-0" aria-label="Swap sides" title="Swap sides"><i class="fa-solid fa-right-left text-xs" aria-hidden="true"></i></button>
        <button type="button" onclick="openAppInNewTab(${jsArg(app.id)})" class="icon-btn w-8 h-8 shrink-0" aria-label="Open ${name} in a new tab" title="Open in new tab"><i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true"></i></button>
        <button type="button" onclick="closeSplitPane('${pane}')" class="icon-btn w-8 h-8 shrink-0 hover:!text-rose-500" aria-label="Close ${name}" title="Close pane"><i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i></button>
    `;
}

function renderPaneHeaders() {
    const headerA = document.getElementById('paneAHeader');
    const headerB = document.getElementById('paneBHeader');
    if (!headerA || !headerB) return;
    if (!splitApp || !currentActiveApp) {
        headerA.innerHTML = '';
        headerB.innerHTML = '';
        return;
    }
    headerA.innerHTML = paneHeaderHtml(currentActiveApp, 'a');
    headerB.innerHTML = paneHeaderHtml(splitApp, 'b');
}

function setSplitRatio(percent) {
    splitRatio = Math.min(80, Math.max(20, percent));
    const swapped = document.getElementById('activeAppView').classList.contains('is-swapped');
    const first = document.getElementById(swapped ? 'paneB' : 'paneA');
    const second = document.getElementById(swapped ? 'paneA' : 'paneB');
    first.style.flexGrow = String(splitRatio);
    second.style.flexGrow = String(100 - splitRatio);
    const divider = document.getElementById('splitDivider');
    if (divider) divider.setAttribute('aria-valuenow', String(Math.round(splitRatio)));
}

function startSplitResize(e) {
    e.preventDefault();
    const container = document.getElementById('splitContainer');
    const sideBySide = window.matchMedia('(min-width: 768px)').matches;
    const rect = container.getBoundingClientRect();
    // Iframes would swallow pointer events mid-drag, so they ignore the pointer while resizing
    container.classList.add('is-resizing');
    const onMove = ev => setSplitRatio(sideBySide
        ? (ev.clientX - rect.left) / rect.width * 100
        : (ev.clientY - rect.top) / rect.height * 100);
    const onUp = () => {
        container.classList.remove('is-resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
}

function handleSplitDividerKey(e) {
    const step = e.shiftKey ? 10 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSplitRatio(splitRatio - step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSplitRatio(splitRatio + step);
    } else if (e.key === 'Home') {
        e.preventDefault();
        setSplitRatio(50);
    }
}

// ==========================================
// COMMAND PALETTE (Ctrl / Cmd + K)
// ==========================================
const PALETTE_MODES = {
    default: { placeholder: 'Search apps and actions…', icon: 'fa-magnifying-glass', hint: 'Search every dashboard, #tags and commands' },
    switch: { placeholder: 'Switch to app…', icon: 'fa-grip', hint: 'Opens in this window' },
    split: { placeholder: 'Open beside the current app…', icon: 'fa-table-columns', hint: 'Only apps that can be embedded are listed' }
};
let paletteMode = 'default';
let paletteItems = [];
let paletteActiveIndex = 0;
let paletteReturnFocus = null;

function openCommandPalette(mode = 'default') {
    if (!isApprovedUser()) return;
    paletteMode = PALETTE_MODES[mode] ? mode : 'default';
    if (paletteMode === 'split' && !currentActiveApp) paletteMode = 'default';
    closeCardMenu();
    paletteReturnFocus = document.activeElement;
    const config = PALETTE_MODES[paletteMode];
    const input = document.getElementById('paletteInput');
    input.value = '';
    input.placeholder = config.placeholder;
    document.getElementById('paletteModeIcon').className = `fa-solid ${config.icon} text-muted`;
    document.getElementById('paletteModeHint').textContent = config.hint;
    document.getElementById('commandPalette').classList.remove('hidden');
    paletteActiveIndex = 0;
    renderPalette();
    setTimeout(() => input.focus(), 20);
}

function closeCommandPalette({ restoreFocus = true } = {}) {
    if (!isOpen('commandPalette')) return;
    document.getElementById('commandPalette').classList.add('hidden');
    if (restoreFocus && paletteReturnFocus && document.contains(paletteReturnFocus)) paletteReturnFocus.focus();
    paletteReturnFocus = null;
}

function scoreText(text, query) {
    const lower = text.toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.length || !tokens.every(t => lower.includes(t))) return 0;
    if (lower.startsWith(query)) return 4;
    if (lower.split(/[\s·/:._-]+/).some(word => word.startsWith(tokens[0]))) return 2.5;
    return 1;
}

function scoreApp(app, query) {
    const base = scoreText(`${app.name} ${appSearchText(app)}`, query);
    if (!base) return 0;
    const nameBonus = scoreText(app.name, query) * 2;
    const usageBonus = Math.min(2, ((usage[app.id] && usage[app.id].count) || 0) / 10);
    return base + nameBonus + usageBonus;
}

function buildPaletteActions() {
    const isDark = document.documentElement.classList.contains('dark');
    const actions = [
        { icon: 'fa-plus', title: 'Add app', keywords: 'new create service', featured: true, run: () => openAddAppModal() },
        { icon: 'fa-table-cells-large', title: 'New dashboard', keywords: 'add page tab', featured: true, run: addDashboard },
        ...dashboards.filter(d => d.id !== activeDashboardId || currentActiveApp).map(d => ({
            icon: d.icon, title: `Go to ${d.name}`, keywords: 'dashboard switch tab',
            run: () => { if (currentActiveApp) returnToDashboard(); switchDashboard(d.id); }
        })),
        { icon: 'fa-table-cells-large', title: 'Grid view', keywords: 'layout cards', run: () => setViewType('grid') },
        { icon: 'fa-list', title: 'List view', keywords: 'layout rows compact', run: () => setViewType('list') },
        { icon: 'fa-layer-group', title: 'Carousel view', keywords: 'layout cover flow 3d', run: () => setViewType('carousel') },
        ...Object.entries(SORT_LABELS).map(([mode, label]) => ({
            icon: 'fa-arrow-down-wide-short', title: `Sort: ${label}`, keywords: 'order recent frequent most used', run: () => setSortMode(mode)
        })),
        { icon: isDark ? 'fa-sun' : 'fa-moon', title: isDark ? 'Switch to light mode' : 'Switch to dark mode', keywords: 'theme appearance dark light mode', featured: true, run: toggleDarkMode },
        { icon: 'fa-gear', title: 'Settings', keywords: 'categories dashboards preferences firebase', featured: true, run: openSettingsModal },
        { icon: 'fa-file-export', title: 'Export backup', keywords: 'download json save', run: exportBackup },
        { icon: 'fa-file-import', title: 'Import backup', keywords: 'upload json restore', run: triggerImportBackup }
    ];
    if (isCurrentUserAdmin()) {
        actions.push({ icon: 'fa-user-check', title: 'Access requests', keywords: 'approve members family', run: openAccessRequestsModal });
        actions.push({ icon: 'fa-clock-rotate-left', title: 'Activity log', keywords: 'audit history sign-ins opens', run: openActivityModal });
    }
    if (deferredInstallPrompt) actions.push({ icon: 'fa-download', title: 'Install PortalHub app', keywords: 'pwa desktop', run: promptInstallApp });
    actions.push({ icon: 'fa-arrow-right-from-bracket', title: 'Sign out', keywords: 'logout log out', run: signOutAuth });
    return actions;
}

function buildPaletteItems(rawQuery) {
    const query = rawQuery.trim().toLowerCase();
    let candidates = apps;
    if (paletteMode === 'split') candidates = apps.filter(a => canEmbed(a) && (!currentActiveApp || a.id !== currentActiveApp.id));
    const appItem = (app, group) => ({
        group,
        app,
        title: app.name,
        subtitle: `${getDashboardName(app.dashboardId)} · ${displayUrl(app.url)}`,
        run: () => (paletteMode === 'split' ? openSplitWith(app.id) : launchApp(app.id))
    });

    const items = [];
    if (!query) {
        const recent = candidates.filter(a => usage[a.id]).sort((a, b) => usage[b.id].last - usage[a.id].last).slice(0, 6);
        const list = recent.length ? recent : candidates.slice(0, 8);
        list.forEach(app => items.push(appItem(app, recent.length ? 'Recent' : 'Apps')));
    } else {
        candidates.map(app => ({ app, score: scoreApp(app, query) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 12)
            .forEach(({ app }) => items.push(appItem(app, 'Apps')));
    }

    if (paletteMode === 'default') {
        const actions = buildPaletteActions();
        const matched = query
            ? actions.map(a => ({ a, score: scoreText(`${a.title} ${a.keywords || ''}`, query) })).filter(x => x.score > 0).sort((x, y) => y.score - x.score).map(x => x.a)
            : actions.filter(a => a.featured);
        matched.slice(0, 10).forEach(action => items.push({ ...action, group: 'Actions' }));
    }
    return items;
}

function renderPalette() {
    const input = document.getElementById('paletteInput');
    const list = document.getElementById('paletteList');
    paletteItems = buildPaletteItems(input.value);
    paletteActiveIndex = 0;
    if (!paletteItems.length) {
        list.innerHTML = `<div class="px-3 py-10 text-center text-sm text-muted">No matches for “${escapeHtml(input.value.trim())}”</div>`;
        input.removeAttribute('aria-activedescendant');
        return;
    }
    let html = '';
    let lastGroup = '';
    paletteItems.forEach((item, i) => {
        if (item.group !== lastGroup) {
            html += `<div class="palette-group" role="presentation">${escapeHtml(item.group)}</div>`;
            lastGroup = item.group;
        }
        const icon = item.app
            ? appIconHtml(item.app, 'w-8 h-8 !rounded-lg', 'text-xs')
            : `<span class="w-8 h-8 rounded-lg glass-inset grid place-items-center text-muted shrink-0"><i class="fa-solid ${escapeHtml(item.icon)} text-xs" aria-hidden="true"></i></span>`;
        html += `
            <button type="button" role="option" id="palette-option-${i}" aria-selected="${i === paletteActiveIndex}" class="palette-item"
                onclick="runPaletteItem(${i})" onmousemove="setPaletteActive(${i})">
                ${icon}
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium truncate">${escapeHtml(item.title)}</span>
                    ${item.subtitle ? `<span class="block text-[11px] text-muted truncate font-mono">${escapeHtml(item.subtitle)}</span>` : ''}
                </span>
                ${item.app ? `<span class="text-[11px] text-muted shrink-0">${paletteMode === 'split' ? 'Side by side' : 'Open'}</span>` : ''}
            </button>`;
    });
    list.innerHTML = html;
    input.setAttribute('aria-activedescendant', `palette-option-${paletteActiveIndex}`);
}

function setPaletteActive(index) {
    if (index === paletteActiveIndex || !paletteItems[index]) return;
    document.getElementById(`palette-option-${paletteActiveIndex}`)?.setAttribute('aria-selected', 'false');
    paletteActiveIndex = index;
    const option = document.getElementById(`palette-option-${index}`);
    if (option) {
        option.setAttribute('aria-selected', 'true');
        option.scrollIntoView({ block: 'nearest' });
    }
    document.getElementById('paletteInput').setAttribute('aria-activedescendant', `palette-option-${index}`);
}

function handlePaletteKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!paletteItems.length) return;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setPaletteActive((paletteActiveIndex + delta + paletteItems.length) % paletteItems.length);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        runPaletteItem(paletteActiveIndex);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeCommandPalette();
    } else if (e.key === 'Tab') {
        e.preventDefault();
    }
}

function runPaletteItem(index) {
    const item = paletteItems[index];
    if (!item) return;
    closeCommandPalette({ restoreFocus: false });
    item.run();
}

// ==========================================
// QR CODE (open an app on a phone)
// ==========================================
const loadedScripts = new Map();
let qrCurrentUrl = '';

function loadScriptOnce(src) {
    if (!loadedScripts.has(src)) {
        loadedScripts.set(src, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                loadedScripts.delete(src);
                reject(new Error(`Could not load ${src}`));
            };
            document.head.appendChild(script);
        }));
    }
    return loadedScripts.get(src);
}

// A URL a phone on the same network can open: loopback hosts become this machine's LAN IP
function getShareableUrl(app) {
    let url;
    try {
        const raw = isLocalFileUrl(app.url) || /^(\.{0,2}\/)/.test(app.url)
            ? getEmbeddableUrl(app.url)
            : resolveLoopbackAddress(normalizeAppUrl(app.url));
        url = new URL(raw, window.location.href);
    } catch(e) {
        return { url: app.url, note: 'This address may not open on another device.' };
    }
    if (url.protocol === 'file:') {
        return { url: url.href, note: "Local files can't be opened from a phone. Start PortalHub with start_portal.bat to share local projects." };
    }
    // Still a loopback address: this page was opened on the gateway machine itself
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        const address = gatewayInfo && gatewayInfo.lan_ips && gatewayInfo.lan_ips[0];
        if (address) {
            url.hostname = address;
            return { url: url.href, note: `Uses the gateway's network address (${address}) so phones on the same Wi-Fi can open it.` };
        }
        return { url: url.href, note: 'This address only works on this computer. Run PortalHub through serve.py to get a network address.' };
    }
    if (isPrivateHost(url.hostname)) return { url: url.href, note: 'Works on phones connected to the same network.' };
    return { url: url.href, note: '' };
}

async function openQrModal(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    const { url, note } = getShareableUrl(app);
    qrCurrentUrl = url;
    document.getElementById('qrAppName').textContent = app.name;
    document.getElementById('qrUrlText').textContent = url;
    document.getElementById('qrNote').textContent = note;
    const box = document.getElementById('qrCodeBox');
    box.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-slate-400" aria-hidden="true"></i>';
    document.getElementById('qrModal').classList.remove('hidden');
    try {
        await loadScriptOnce('js/vendor/qrcode.js');
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, title: `QR code for ${app.name}` });
        box.firstElementChild.setAttribute('class', 'w-full h-full');
    } catch(e) {
        box.innerHTML = '<p class="text-xs text-slate-500 px-4">Could not create the QR code. Use Copy link instead.</p>';
    }
}

function closeQrModal() {
    document.getElementById('qrModal').classList.add('hidden');
}

async function copyQrUrl() {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(qrCurrentUrl);
        } else {
            // Plain-http pages (e.g. a NAS address) have no Clipboard API; use a hidden text field
            const field = document.createElement('textarea');
            field.value = qrCurrentUrl;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            const copied = document.execCommand('copy');
            field.remove();
            if (!copied) throw new Error('copy command refused');
        }
        showToast('Link copied');
    } catch(e) {
        showToast('Copy failed: select the link and copy it manually', { error: true });
    }
}

// ==========================================
// ADD / EDIT APP DIALOG
// ==========================================
let editingTags = [];
let autofillBusy = false;
const AUTOFILL_DEFAULT_HINT = 'An IP, URL, or local path such as D:/PROJECTS/PSE/index.html';

function populateCategoryDropdown(selectedVal = '') {
    const select = document.getElementById('appCategoryInput');
    const options = [...new Set([...categories, selectedVal].filter(Boolean))];
    select.innerHTML = options.map(cat => `
        <option value="${escapeHtml(cat)}" ${cat === selectedVal ? 'selected' : ''}>${escapeHtml(cat)}</option>
    `).join('');
}

function populateDashboardDropdown(selectedId) {
    const select = document.getElementById('appDashboardInput');
    select.innerHTML = dashboards.map(d => `
        <option value="${escapeHtml(d.id)}" ${d.id === selectedId ? 'selected' : ''}>${escapeHtml(d.name)}</option>
    `).join('');
}

function populateTagSuggestions() {
    const datalist = document.getElementById('tagSuggestions');
    const allTags = [...new Set(apps.flatMap(a => a.tags))].sort();
    datalist.innerHTML = allTags.map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
}

// Color swatches; a stored color that isn't in the palette is kept as an extra swatch
function renderColorSwatches(selected) {
    const container = document.getElementById('appColorSwatches');
    const input = document.getElementById('appColorInput');
    if (!container || !input) return;
    const value = selected || APP_COLORS[0];
    input.value = value;
    const palette = APP_COLORS.includes(value) ? APP_COLORS : [value, ...APP_COLORS];
    container.innerHTML = palette.map(color => {
        const isSelected = color === value;
        const label = color.replace(/from-|to-|-\d+/g, '').trim().replace(/\s+/, ' & ');
        return `
            <button type="button" role="radio" aria-checked="${isSelected}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" onclick="renderColorSwatches(${jsArg(color)})"
                class="w-8 h-8 rounded-lg bg-gradient-to-br ${escapeHtml(color)} flex items-center justify-center text-white transition-transform hover:scale-110 ${isSelected ? 'ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--bg)]' : ''}">
                ${isSelected ? '<i class="fa-solid fa-check text-xs" aria-hidden="true"></i>' : ''}
            </button>
        `;
    }).join('');
}

function renderTagChips() {
    document.getElementById('appTagsChips').innerHTML = editingTags.map(t => `
        <span class="chip chip-tag !h-7 !pr-1">
            <span>#${escapeHtml(t)}</span>
            <button type="button" onclick="event.stopPropagation(); removeEditingTag(${jsArg(t)})" class="w-5 h-5 grid place-items-center rounded-full hover:bg-[var(--surface-inset-hover)]" aria-label="Remove tag ${escapeHtml(t)}">
                <i class="fa-solid fa-xmark text-[9px]" aria-hidden="true"></i>
            </button>
        </span>
    `).join('');
}

function addEditingTags(text) {
    String(text).split(',').map(cleanTag).filter(Boolean).forEach(tag => {
        if (!editingTags.includes(tag) && editingTags.length < 12) editingTags.push(tag);
    });
    renderTagChips();
}

function removeEditingTag(tag) {
    editingTags = editingTags.filter(t => t !== tag);
    renderTagChips();
}

function commitTagInput() {
    const input = document.getElementById('appTagsInput');
    if (input.value.trim()) {
        addEditingTags(input.value);
        input.value = '';
    }
}

function handleTagInputKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
        if (e.target.value.trim()) {
            e.preventDefault();
            commitTagInput();
        } else if (e.key === ',') {
            e.preventDefault();
        }
    } else if (e.key === 'Backspace' && !e.target.value && editingTags.length) {
        editingTags.pop();
        renderTagChips();
    }
}

function setFaviconPreview(url, useIt = true) {
    const row = document.getElementById('faviconRow');
    const img = document.getElementById('faviconPreview');
    const input = document.getElementById('appFaviconInput');
    const toggle = document.getElementById('appUseFaviconInput');
    if (!url) {
        row.classList.add('hidden');
        input.value = '';
        img.removeAttribute('src');
        return;
    }
    input.value = url;
    toggle.checked = useIt;
    img.onerror = () => {
        row.classList.add('hidden');
        input.value = '';
    };
    img.src = url;
    row.classList.remove('hidden');
}

function resetAppForm() {
    document.getElementById('appForm').reset();
    document.getElementById('appEditId').value = '';
    document.getElementById('autofillStatus').textContent = AUTOFILL_DEFAULT_HINT;
    editingTags = [];
    renderTagChips();
    populateTagSuggestions();
    setFaviconPreview('');
    closeIconPickerDropdown();
}

function openAddAppModal() {
    resetAppForm();
    document.getElementById('appModalTitle').innerText = 'Add app';
    populateDashboardDropdown(activeDashboardId);
    populateCategoryDropdown(selectedCategories.size === 1 ? [...selectedCategories][0] : categories[0]);
    if (selectedTags.size === 1) addEditingTags([...selectedTags][0]);
    setIconPickerValue('fa-server');
    renderColorSwatches(APP_COLORS[0]);
    document.getElementById('appLaunchModeInput').value = 'iframe';
    document.getElementById('appModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('appUrlInput').focus(), 50);
}

function openEditAppModal(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    resetAppForm();
    document.getElementById('appEditId').value = app.id;
    document.getElementById('appModalTitle').innerText = 'Edit app';
    document.getElementById('appNameInput').value = app.name;
    document.getElementById('appUrlInput').value = app.url;
    populateDashboardDropdown(app.dashboardId);
    populateCategoryDropdown(app.category);
    setIconPickerValue(app.icon || 'fa-server');
    renderColorSwatches(app.color);
    document.getElementById('appLaunchModeInput').value = app.launchMode || (isKnownIframeBlocked(app.url) ? 'newtab' : 'iframe');
    document.getElementById('appDescInput').value = app.description || '';
    document.getElementById('appPinnedInput').checked = app.pinned;
    editingTags = [...app.tags];
    renderTagChips();
    if (app.favicon) setFaviconPreview(app.favicon, true);
    document.getElementById('appModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('appNameInput').focus(), 50);
}

function closeAddAppModal() {
    closeIconPickerDropdown();
    document.getElementById('appModal').classList.add('hidden');
}

function saveCustomApp(e) {
    e.preventDefault();
    commitTagInput();
    const editId = document.getElementById('appEditId').value;
    const useFavicon = document.getElementById('appUseFaviconInput').checked;
    const appData = normalizeApp({
        id: editId || ('app-' + Date.now()),
        name: document.getElementById('appNameInput').value,
        url: normalizeAppUrl(document.getElementById('appUrlInput').value),
        category: document.getElementById('appCategoryInput').value,
        dashboardId: document.getElementById('appDashboardInput').value,
        launchMode: document.getElementById('appLaunchModeInput').value || 'iframe',
        icon: document.getElementById('appIconInput').value || 'fa-server',
        color: document.getElementById('appColorInput').value || APP_COLORS[0],
        description: document.getElementById('appDescInput').value,
        tags: editingTags,
        pinned: document.getElementById('appPinnedInput').checked,
        favicon: useFavicon ? document.getElementById('appFaviconInput').value : ''
    });
    if (!categories.includes(appData.category)) {
        categories.push(appData.category);
        saveCategories();
    }

    if (editId) {
        const index = apps.findIndex(a => a.id === editId);
        if (index !== -1) apps[index] = appData;
    } else {
        apps.push(appData);
    }
    saveApps();
    closeAddAppModal();
    renderDashboard();

    if (appData.dashboardId !== activeDashboardId) {
        showToast(`${editId ? 'Updated' : 'Added'} ${appData.name} on ${getDashboardName(appData.dashboardId)}`, {
            action: 'Go there', onAction: () => switchDashboard(appData.dashboardId)
        });
    } else {
        showToast(`${editId ? 'Updated' : 'Added'} ${appData.name}`);
    }
}

// Delete immediately, with an Undo in the toast instead of a confirmation prompt
function deleteApp(appId) {
    const index = apps.findIndex(a => a.id === appId);
    if (index === -1) return;
    const [removed] = apps.splice(index, 1);
    saveApps();
    renderDashboard();
    showToast(`Deleted ${removed.name}`, {
        action: 'Undo',
        duration: 6000,
        onAction: () => {
            apps.splice(Math.min(index, apps.length), 0, removed);
            saveApps();
            renderDashboard();
            showToast(`Restored ${removed.name}`);
        }
    });
}

// ---------- Auto-fill from the page ----------
function titleFromHost(url) {
    const host = url.hostname.replace(/^www\./, '');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return host;
    const label = host.split('.')[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function fillFromMeta(meta) {
    const filled = [];
    const nameInput = document.getElementById('appNameInput');
    const descInput = document.getElementById('appDescInput');
    if (!nameInput.value.trim() && meta.title) {
        nameInput.value = String(meta.title).slice(0, 80);
        filled.push('name');
    }
    if (!descInput.value.trim() && meta.description) {
        descInput.value = String(meta.description).slice(0, 300);
        filled.push('description');
    }
    if (meta.icon && isSafeImageUrl(meta.icon)) {
        setFaviconPreview(meta.icon, true);
        filled.push('icon');
    }
    return filled;
}

async function autofillFromUrl({ quiet = false } = {}) {
    const urlInput = document.getElementById('appUrlInput');
    const status = document.getElementById('autofillStatus');
    const button = document.getElementById('autofillBtn');
    const raw = urlInput.value.trim();
    if (!raw) {
        if (!quiet) {
            status.textContent = 'Enter an address first.';
            urlInput.focus();
        }
        return;
    }
    if (autofillBusy) return;

    let target;
    try {
        target = new URL(getEmbeddableUrl(normalizeAppUrl(raw)), window.location.href);
    } catch(e) {
        status.textContent = "That address doesn't look valid.";
        return;
    }
    if (!/^https?:$/.test(target.protocol)) {
        const filled = fillFromMeta({ title: (raw.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] || 'Local app') });
        if (!quiet) status.textContent = filled.length ? 'Named it from the folder. Auto-fill reads pages only over http(s).' : 'Auto-fill reads pages only over http(s).';
        return;
    }

    autofillBusy = true;
    button.disabled = true;
    status.textContent = `Reading ${target.host}…`;
    let meta = null;
    let source = 'address';
    if (gatewayInfo) {
        try {
            const res = await fetch('/api/meta?url=' + encodeURIComponent(target.href), { cache: 'no-store' });
            if (res.ok) {
                meta = await res.json();
                source = 'page';
            }
        } catch(e) {}
    }
    if (!meta && !isPrivateHost(target.hostname)) {
        // Public site without the gateway: use its public favicon
        meta = { title: titleFromHost(target), icon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(target.hostname)}&sz=128` };
        source = 'public';
    }
    if (!meta) meta = { title: titleFromHost(target) };

    const filled = fillFromMeta(meta);
    // Sites like Google or GitHub refuse to be embedded, so open them in a tab by default
    const launchSelect = document.getElementById('appLaunchModeInput');
    if (isKnownIframeBlocked(target.href) && launchSelect.value === 'iframe') {
        launchSelect.value = 'newtab';
        filled.push('“Open in: New browser tab” (this site blocks embedding)');
    }
    if (source === 'page') {
        status.textContent = filled.length ? `Filled in ${filled.join(', ')} from the page.` : 'Nothing new found on the page.';
    } else if (source === 'public') {
        status.textContent = `Used ${target.hostname}'s icon. Run PortalHub through serve.py to also read page titles.`;
    } else {
        status.textContent = gatewayInfo
            ? `Couldn't reach ${target.host}, so the name comes from the address.`
            : 'Named it from the address. Run PortalHub through serve.py to read titles and icons from LAN pages.';
    }
    button.disabled = false;
    autofillBusy = false;
}

// Auto-fill once the address is entered, if the name is still empty
function maybeAutofill() {
    if (!document.getElementById('appNameInput').value.trim() && document.getElementById('appUrlInput').value.trim()) {
        autofillFromUrl({ quiet: true });
    }
}

// ==========================================
// FONTAWESOME SEARCHABLE ICON PICKER
// ==========================================
const FONTAWESOME_ICONS = [
    // Finance & Trading
    { id: 'fa-piggy-bank', name: 'Piggy Bank', category: 'Finance' },
    { id: 'fa-coins', name: 'Coins / Wealth', category: 'Finance' },
    { id: 'fa-wallet', name: 'Wallet', category: 'Finance' },
    { id: 'fa-chart-line', name: 'Stock Chart Line', category: 'Finance' },
    { id: 'fa-chart-pie', name: 'Pie Chart / Assets', category: 'Finance' },
    { id: 'fa-money-bill-trend-up', name: 'Money Trend Up', category: 'Finance' },
    { id: 'fa-scale-balanced', name: 'Balance Scale', category: 'Finance' },
    { id: 'fa-vault', name: 'Vault / Safe', category: 'Finance' },
    { id: 'fa-landmark', name: 'Bank / Landmark', category: 'Finance' },
    { id: 'fa-receipt', name: 'Receipt / Transactions', category: 'Finance' },
    { id: 'fa-credit-card', name: 'Credit Card', category: 'Finance' },
    { id: 'fa-file-invoice-dollar', name: 'Invoice / Billing', category: 'Finance' },

    // Servers, Cloud & Infrastructure
    { id: 'fa-server', name: 'Server', category: 'Servers & Cloud' },
    { id: 'fa-database', name: 'Database / SQL', category: 'Servers & Cloud' },
    { id: 'fa-network-wired', name: 'Network Wired / LAN', category: 'Servers & Cloud' },
    { id: 'fa-cloud', name: 'Cloud Infrastructure', category: 'Servers & Cloud' },
    { id: 'fa-hard-drive', name: 'Hard Drive / Storage', category: 'Servers & Cloud' },
    { id: 'fa-microchip', name: 'CPU / Microchip', category: 'Servers & Cloud' },
    { id: 'fa-memory', name: 'RAM Memory', category: 'Servers & Cloud' },
    { id: 'fa-terminal', name: 'Terminal / CLI', category: 'Servers & Cloud' },
    { id: 'fa-sitemap', name: 'Sitemap / Architecture', category: 'Servers & Cloud' },
    { id: 'fa-cubes', name: 'Cubes / Microservices', category: 'Servers & Cloud' },
    { id: 'fa-box-archive', name: 'Archive / Backup', category: 'Servers & Cloud' },
    { id: 'fa-boxes-stacked', name: 'Containers / Docker', category: 'Servers & Cloud' },
    { id: 'fa-ethernet', name: 'Ethernet Cable', category: 'Servers & Cloud' },

    // Web, Dev & Networking
    { id: 'fa-globe', name: 'Globe / Internet', category: 'Web & Dev' },
    { id: 'fa-code', name: 'Code / Development', category: 'Web & Dev' },
    { id: 'fa-file-code', name: 'Source Code File', category: 'Web & Dev' },
    { id: 'fa-gears', name: 'Gears / Automation', category: 'Web & Dev' },
    { id: 'fa-gear', name: 'Settings / Config', category: 'Web & Dev' },
    { id: 'fa-screwdriver-wrench', name: 'Tools / Maintenance', category: 'Web & Dev' },
    { id: 'fa-wrench', name: 'Wrench', category: 'Web & Dev' },
    { id: 'fa-bug', name: 'Debugger / Bug', category: 'Web & Dev' },
    { id: 'fa-satellite-dish', name: 'Satellite / Gateway', category: 'Web & Dev' },
    { id: 'fa-wifi', name: 'Wi-Fi Wireless', category: 'Web & Dev' },
    { id: 'fa-signal', name: 'Signal / Telemetry', category: 'Web & Dev' },
    { id: 'fa-link', name: 'Hyperlink / URL', category: 'Web & Dev' },
    { id: 'fa-arrow-up-right-from-square', name: 'External Link', category: 'Web & Dev' },
    { id: 'fa-download', name: 'Download Service', category: 'Web & Dev' },
    { id: 'fa-upload', name: 'Upload Service', category: 'Web & Dev' },
    { id: 'fa-rss', name: 'RSS Feed', category: 'Web & Dev' },

    // Security & Admin
    { id: 'fa-shield-halved', name: 'Shield / Firewall', category: 'Security' },
    { id: 'fa-lock', name: 'Lock / HTTPS', category: 'Security' },
    { id: 'fa-unlock', name: 'Unlock', category: 'Security' },
    { id: 'fa-key', name: 'Key / Credentials', category: 'Security' },
    { id: 'fa-user-shield', name: 'Admin Security', category: 'Security' },
    { id: 'fa-user-gear', name: 'User Management', category: 'Security' },
    { id: 'fa-fingerprint', name: 'Fingerprint / 2FA', category: 'Security' },
    { id: 'fa-passport', name: 'Passport / Auth', category: 'Security' },
    { id: 'fa-id-card', name: 'ID Card', category: 'Security' },
    { id: 'fa-triangle-exclamation', name: 'Warning / Alert', category: 'Security' },

    // Dashboards & Analytics
    { id: 'fa-gauge-high', name: 'Gauge / Grafana', category: 'Analytics' },
    { id: 'fa-chart-simple', name: 'Simple Chart', category: 'Analytics' },
    { id: 'fa-chart-bar', name: 'Bar Chart', category: 'Analytics' },
    { id: 'fa-chart-area', name: 'Area Chart', category: 'Analytics' },
    { id: 'fa-table-columns', name: 'Table Columns', category: 'Analytics' },
    { id: 'fa-table-cells-large', name: 'Grid View', category: 'Analytics' },
    { id: 'fa-table-list', name: 'Table List', category: 'Analytics' },
    { id: 'fa-sliders', name: 'Sliders / Controls', category: 'Analytics' },
    { id: 'fa-desktop', name: 'Desktop Workstation', category: 'Hardware' },
    { id: 'fa-display', name: 'Display Screen', category: 'Hardware' },
    { id: 'fa-laptop', name: 'Laptop', category: 'Hardware' },
    { id: 'fa-mobile-screen', name: 'Mobile Phone', category: 'Hardware' },

    // Media & Files
    { id: 'fa-folder', name: 'Folder', category: 'Media & Files' },
    { id: 'fa-folder-open', name: 'Folder Open', category: 'Media & Files' },
    { id: 'fa-folder-tree', name: 'Folder Tree', category: 'Media & Files' },
    { id: 'fa-file-lines', name: 'Document / Text', category: 'Media & Files' },
    { id: 'fa-file-pdf', name: 'PDF Document', category: 'Media & Files' },
    { id: 'fa-image', name: 'Photo / Image', category: 'Media & Files' },
    { id: 'fa-photo-film', name: 'Media Library', category: 'Media & Files' },
    { id: 'fa-video', name: 'Video / Streams', category: 'Media & Files' },
    { id: 'fa-film', name: 'Cinema / Movies', category: 'Media & Files' },
    { id: 'fa-music', name: 'Music / Audio', category: 'Media & Files' },
    { id: 'fa-headphones', name: 'Headphones', category: 'Media & Files' },
    { id: 'fa-camera', name: 'Camera', category: 'Media & Files' },

    // Smart Home & IoT
    { id: 'fa-house-signal', name: 'Home Assistant / IoT', category: 'Smart Home' },
    { id: 'fa-house', name: 'Home Dashboard', category: 'Smart Home' },
    { id: 'fa-robot', name: 'Robot / AI', category: 'Smart Home' },
    { id: 'fa-lightbulb', name: 'Lighting Control', category: 'Smart Home' },
    { id: 'fa-plug', name: 'Smart Plug / Power', category: 'Smart Home' },
    { id: 'fa-bolt', name: 'Fast / Energy', category: 'Smart Home' },
    { id: 'fa-battery-full', name: 'Battery Status', category: 'Smart Home' },
    { id: 'fa-fan', name: 'Cooling Fan', category: 'Smart Home' },
    { id: 'fa-temperature-half', name: 'Thermometer', category: 'Smart Home' },

    // Productivity & General
    { id: 'fa-calendar-days', name: 'Calendar', category: 'Productivity' },
    { id: 'fa-clock', name: 'Clock / Schedules', category: 'Productivity' },
    { id: 'fa-bell', name: 'Notifications', category: 'Productivity' },
    { id: 'fa-bookmark', name: 'Bookmark', category: 'Productivity' },
    { id: 'fa-list-check', name: 'Checklist / Tasks', category: 'Productivity' },
    { id: 'fa-envelope', name: 'Email Server', category: 'Productivity' },
    { id: 'fa-comments', name: 'Chat / Matrix', category: 'Productivity' },
    { id: 'fa-bullhorn', name: 'Announcements', category: 'Productivity' },
    { id: 'fa-gamepad', name: 'Gaming Server', category: 'Entertainment' },
    { id: 'fa-star', name: 'Star / Favorite', category: 'General' },
    { id: 'fa-heart', name: 'Heart / Health', category: 'General' },
    { id: 'fa-circle-check', name: 'Checkmark / Verified', category: 'General' },
    { id: 'fa-circle-info', name: 'Information', category: 'General' }
];

function filterIconPickerList(val) {
    renderIconPickerList(val);
}

function toggleIconPickerDropdown() {
    const dropdown = document.getElementById('iconPickerDropdown');
    const chevron = document.getElementById('iconPickerChevron');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        dropdown.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        const searchInput = document.getElementById('iconSearchInput');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }
        renderIconPickerList('');
    } else {
        closeIconPickerDropdown();
    }
}

function closeIconPickerDropdown() {
    const dropdown = document.getElementById('iconPickerDropdown');
    const chevron = document.getElementById('iconPickerChevron');
    if (dropdown) dropdown.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
}

function selectPickerIcon(iconId, iconName) {
    const input = document.getElementById('appIconInput');
    const preview = document.getElementById('selectedIconPreview');
    const label = document.getElementById('selectedIconLabel');
    if (input) input.value = iconId;
    if (preview) preview.className = `fa-solid ${iconId} text-sm`;
    if (label) label.innerText = `${iconId} (${iconName})`;
    closeIconPickerDropdown();
}

function setIconPickerValue(iconId) {
    const input = document.getElementById('appIconInput');
    const preview = document.getElementById('selectedIconPreview');
    const label = document.getElementById('selectedIconLabel');
    const cleanId = (iconId || 'fa-server').trim();
    if (input) input.value = cleanId;
    if (preview) preview.className = `fa-solid ${cleanId} text-sm`;
    const matched = FONTAWESOME_ICONS.find(i => i.id === cleanId);
    const displayLabel = matched ? `${cleanId} (${matched.name})` : cleanId;
    if (label) label.innerText = displayLabel;
}

function applyCustomIcon() {
    const customInput = document.getElementById('customIconTextInput');
    if (!customInput) return;
    let val = customInput.value.trim();
    if (!val) return;
    if (!val.startsWith('fa-')) val = 'fa-' + val;
    setIconPickerValue(val);
    closeIconPickerDropdown();
}

function renderIconPickerList(filterText = '') {
    const grid = document.getElementById('iconPickerGrid');
    const countEl = document.getElementById('iconPickerCount');
    const currentVal = document.getElementById('appIconInput')?.value || 'fa-server';
    if (!grid) return;

    const q = filterText.toLowerCase().trim();
    const filtered = q === ''
        ? FONTAWESOME_ICONS
        : FONTAWESOME_ICONS.filter(i => i.id.includes(q) || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));

    if (countEl) countEl.innerText = `${filtered.length} icon${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="py-6 text-center text-muted text-xs">
                No matching icon. Type a custom class below (e.g. fa-xxx).
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(icon => {
        const isSelected = icon.id === currentVal;
        return `
            <button type="button" role="option" aria-selected="${isSelected}" onclick="selectPickerIcon(${jsArg(icon.id)}, ${jsArg(icon.name)})"
                class="menu-item !py-1.5 ${isSelected ? '!bg-[var(--accent-soft)]' : ''}">
                <span class="w-7 h-7 rounded-lg grid place-items-center shrink-0 ${isSelected ? 'bg-[var(--accent)] text-white' : 'glass-inset'}">
                    <i class="fa-solid ${icon.id} !w-auto !text-[13px] ${isSelected ? '!text-white' : '!text-[var(--text)]'}" aria-hidden="true"></i>
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-semibold truncate">${escapeHtml(icon.name)}</span>
                    <span class="block text-[10px] font-mono text-muted truncate">${icon.id}</span>
                </span>
                <span class="chip chip-neutral !h-5 !text-[9px]">${escapeHtml(icon.category)}</span>
            </button>
        `;
    }).join('');
}

// ==========================================
// SETTINGS: dashboards, categories, data
// ==========================================
function openSettingsModal() {
    renderSettingsDashboardList();
    renderSettingsCategoryList();
    const isAdmin = isCurrentUserAdmin();
    document.getElementById('firebaseSettingsSection')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('firebaseSettingsDivider')?.classList.toggle('hidden', !isAdmin);
    const fbArea = document.getElementById('firebaseConfigTextarea');
    if (fbArea) fbArea.value = isAdmin && firebaseConfig ? JSON.stringify(firebaseConfig, null, 2) : '';
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function renderSettingsDashboardList() {
    const list = document.getElementById('settingsDashboardList');
    if (!list) return;
    list.innerHTML = dashboards.map(d => {
        const count = apps.filter(a => a.dashboardId === d.id).length;
        return `
            <div class="glass-inset rounded-xl pl-3 pr-1.5 py-1.5 flex items-center gap-3">
                <i class="fa-solid ${escapeHtml(d.icon)} text-accent w-4 text-center text-sm" aria-hidden="true"></i>
                <span class="flex-1 text-sm font-medium truncate">${escapeHtml(d.name)}</span>
                <span class="text-xs text-muted">${count} app${count === 1 ? '' : 's'}</span>
                <button type="button" onclick="renameDashboard(${jsArg(d.id)})" class="icon-btn w-8 h-8" aria-label="Rename ${escapeHtml(d.name)}" title="Rename"><i class="fa-solid fa-pen text-xs" aria-hidden="true"></i></button>
                ${dashboards.length > 1 ? `<button type="button" onclick="deleteDashboard(${jsArg(d.id)})" class="icon-btn w-8 h-8 hover:!text-rose-500" aria-label="Delete ${escapeHtml(d.name)}" title="Delete"><i class="fa-solid fa-trash text-xs" aria-hidden="true"></i></button>` : ''}
            </div>
        `;
    }).join('');
}

function renderSettingsCategoryList() {
    const list = document.getElementById('settingsCategoryList');
    if (!list) return;
    list.innerHTML = categories.map((cat, idx) => {
        const count = apps.filter(a => a.category === cat).length;
        return `
            <div class="glass-inset rounded-xl pl-3 pr-1.5 py-1.5 flex items-center gap-3">
                <span class="flex-1 text-sm font-medium truncate">${escapeHtml(cat)}</span>
                <span class="text-xs text-muted">${count} app${count === 1 ? '' : 's'}</span>
                <button type="button" onclick="renameCategory(${idx})" class="icon-btn w-8 h-8" aria-label="Rename ${escapeHtml(cat)}" title="Rename"><i class="fa-solid fa-pen text-xs" aria-hidden="true"></i></button>
                ${categories.length > 1 ? `<button type="button" onclick="deleteCategory(${idx})" class="icon-btn w-8 h-8 hover:!text-rose-500" aria-label="Delete ${escapeHtml(cat)}" title="Delete"><i class="fa-solid fa-trash text-xs" aria-hidden="true"></i></button>` : ''}
            </div>
        `;
    }).join('');
}

function addNewCategory(e) {
    e.preventDefault();
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim().slice(0, 40);
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
        showToast('Category already exists', { error: true });
        return;
    }
    categories.push(name);
    saveCategories();
    input.value = '';
    renderSettingsCategoryList();
    renderFilterBar();
    showToast(`Added category "${name}"`);
}

async function renameCategory(index) {
    const oldName = categories[index];
    if (oldName === undefined) return;
    const newName = await askText({ title: 'Rename category', label: 'Name', value: oldName, confirmText: 'Rename' });
    if (!newName || newName === oldName) return;
    if (categories.some(c => c !== oldName && c.toLowerCase() === newName.toLowerCase())) {
        showToast('Category already exists', { error: true });
        return;
    }
    categories[index] = newName;
    apps.forEach(app => { if (app.category === oldName) app.category = newName; });
    if (selectedCategories.delete(oldName)) selectedCategories.add(newName);
    saveCategories();
    saveApps();
    renderSettingsCategoryList();
    renderDashboard();
    showToast(`Renamed category to "${newName}"`);
}

async function deleteCategory(index) {
    const catToDelete = categories[index];
    if (catToDelete === undefined || categories.length <= 1) return;
    const fallbackCategory = categories.find(c => c !== catToDelete);
    const count = apps.filter(a => a.category === catToDelete).length;
    const confirmed = await askChoice({
        title: `Delete "${catToDelete}"?`,
        message: count ? `Its ${count} app${count === 1 ? '' : 's'} will move to "${fallbackCategory}".` : 'No apps use this category.',
        confirmText: 'Delete category',
        danger: true
    });
    if (!confirmed) return;
    apps.forEach(app => { if (app.category === catToDelete) app.category = fallbackCategory; });
    categories.splice(index, 1);
    selectedCategories.delete(catToDelete);
    saveCategories();
    saveApps();
    renderSettingsCategoryList();
    renderDashboard();
    showToast(`Deleted category "${catToDelete}"`);
}

async function startEmptyPortal() {
    const confirmed = await askChoice({
        title: 'Remove all apps?',
        message: 'Every app on every dashboard will be removed. Export a backup first if you might want them back.',
        confirmText: 'Remove all',
        danger: true
    });
    if (!confirmed) return;
    apps = [];
    selectedCategories.clear();
    selectedTags.clear();
    saveApps();
    closeSettingsModal();
    renderDashboard();
    showToast('All apps removed');
}

async function loadSampleApps() {
    if (apps.length) {
        const confirmed = await askChoice({
            title: 'Load sample apps?',
            message: 'Your current apps, dashboards and categories will be replaced with the demo services.',
            confirmText: 'Replace with samples',
            danger: true
        });
        if (!confirmed) return;
    }
    categories = [...defaultCategories];
    dashboards = clone(defaultDashboards);
    apps = clone(defaultApps).map(normalizeApp);
    activeDashboardId = dashboards[0].id;
    localStorage.setItem(STORAGE_KEYS.activeDashboard, activeDashboardId);
    selectedCategories.clear();
    selectedTags.clear();
    saveCategories();
    saveDashboards();
    saveApps();
    closeSettingsModal();
    renderDashboard();
    showToast('Sample apps loaded');
}

// ---------- Backup & restore ----------
function exportBackup() {
    const data = {
        app: 'PortalHub',
        version: 2,
        exportedAt: new Date().toISOString(),
        dashboards,
        categories,
        apps
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `portalhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast(`Exported ${apps.length} app${apps.length === 1 ? '' : 's'}`);
}

function triggerImportBackup() {
    document.getElementById('backupFileInput').click();
}

async function handleBackupFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showToast('That file is too large to be a PortalHub backup', { error: true });
        return;
    }
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch(e) {
        showToast("That file isn't valid JSON", { error: true });
        return;
    }
    const importedApps = Array.isArray(data) ? data : data && data.apps;
    if (!Array.isArray(importedApps)) {
        showToast("That file doesn't look like a PortalHub backup", { error: true });
        return;
    }

    const choice = await askChoice({
        title: 'Import backup',
        message: `${importedApps.length} app${importedApps.length === 1 ? '' : 's'} found in ${file.name}. Merge adds new apps and updates matching ones; Replace removes everything else.`,
        choices: [
            { label: 'Cancel', value: null, style: 'ghost' },
            { label: 'Merge', value: 'merge', style: 'ghost' },
            { label: 'Replace all', value: 'replace', style: 'danger' }
        ]
    });
    if (!choice) return;

    const importedDashboards = Array.isArray(data.dashboards) ? data.dashboards.map(normalizeDashboard).filter(Boolean) : [];
    const importedCategories = Array.isArray(data.categories) ? data.categories.map(c => String(c).trim().slice(0, 40)).filter(Boolean) : [];
    if (choice === 'replace') {
        dashboards = importedDashboards.length ? importedDashboards : clone(defaultDashboards);
        categories = importedCategories.length ? [...new Set(importedCategories)] : [...defaultCategories];
        apps = [];
    } else {
        importedDashboards.forEach(d => { if (!dashboards.some(x => x.id === d.id)) dashboards.push(d); });
        importedCategories.forEach(c => { if (!categories.includes(c)) categories.push(c); });
    }
    // Dashboards must be in place before normalizeApp checks each app's dashboardId
    importedApps.forEach(raw => {
        const app = normalizeApp(raw);
        if (!categories.includes(app.category)) categories.push(app.category);
        const existing = apps.findIndex(a => a.id === app.id);
        if (existing === -1) apps.push(app);
        else apps[existing] = app;
    });
    if (!dashboards.some(d => d.id === activeDashboardId)) activeDashboardId = dashboards[0].id;
    localStorage.setItem(STORAGE_KEYS.activeDashboard, activeDashboardId);
    selectedCategories.clear();
    selectedTags.clear();
    saveDashboards();
    saveCategories();
    saveApps();
    logAudit('backup_import', file.name);
    closeSettingsModal();
    renderDashboard();
    showToast(`Imported ${importedApps.length} app${importedApps.length === 1 ? '' : 's'}`);
}

// ==========================================
// ACTIVITY LOG VIEW (admin)
// ==========================================
const ACTIVITY_TYPES = {
    sign_in: { icon: 'fa-right-to-bracket', tone: 'emerald', text: () => 'signed in' },
    sign_out: { icon: 'fa-right-from-bracket', tone: 'neutral', text: () => 'signed out' },
    access_request: { icon: 'fa-user-clock', tone: 'amber', text: () => 'requested access' },
    approve: { icon: 'fa-user-check', tone: 'emerald', text: t => `approved ${t}` },
    decline: { icon: 'fa-user-xmark', tone: 'rose', text: t => `declined ${t}` },
    revoke: { icon: 'fa-user-slash', tone: 'rose', text: t => `revoked access for ${t}` },
    pre_approve: { icon: 'fa-user-plus', tone: 'blue', text: t => `pre-approved ${t}` },
    app_open: { icon: 'fa-arrow-up-right-from-square', tone: 'blue', text: t => `opened ${t}` },
    backup_import: { icon: 'fa-file-import', tone: 'neutral', text: t => `imported a backup${t ? ` (${t})` : ''}` }
};
const ACTIVITY_TONES = {
    emerald: 'bg-[var(--emerald-soft)] text-emerald',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    blue: 'bg-[var(--accent-soft)] text-accent',
    neutral: 'glass-inset text-muted'
};
const ACTIVITY_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'auth', label: 'Sign-ins', types: ['sign_in', 'sign_out'] },
    { id: 'access', label: 'Access', types: ['access_request', 'approve', 'decline', 'revoke', 'pre_approve'] },
    { id: 'apps', label: 'App opens', types: ['app_open'] }
];
let activityEntries = [];
let activitySource = 'local';
let activityFilter = 'all';

function openActivityModal() {
    if (!isCurrentUserAdmin()) return;
    document.getElementById('activityModal').classList.remove('hidden');
    loadActivity();
}

function closeActivityModal() {
    document.getElementById('activityModal').classList.add('hidden');
}

async function loadActivity() {
    document.getElementById('activitySource').textContent = 'Loading…';
    document.getElementById('activityList').innerHTML = '<div class="py-12 text-center text-muted"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></div>';
    const result = await fetchAuditEntries();
    activityEntries = result.entries;
    activitySource = result.source;
    renderActivity();
}

function setActivityFilter(id) {
    activityFilter = id;
    renderActivity();
}

function activityDayLabel(date) {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function renderActivity() {
    document.getElementById('activitySource').textContent = activitySource === 'cloud'
        ? `Latest ${activityEntries.length} events from every device`
        : 'This device only (the cloud log needs a Google sign-in while online)';
    document.getElementById('activityFilters').innerHTML = ACTIVITY_FILTERS.map(f => `
        <button type="button" class="filter-chip" aria-pressed="${activityFilter === f.id}" onclick="setActivityFilter('${f.id}')">${f.label}</button>
    `).join('');

    const filter = ACTIVITY_FILTERS.find(f => f.id === activityFilter);
    const entries = activityEntries.filter(e => ACTIVITY_TYPES[e.type] && (!filter.types || filter.types.includes(e.type)));
    const list = document.getElementById('activityList');
    if (!entries.length) {
        list.innerHTML = '<div class="py-12 text-center text-sm text-muted">No activity yet.</div>';
        return;
    }

    const groups = [];
    entries.forEach(entry => {
        const label = activityDayLabel(entry.at);
        if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, entries: [] });
        groups[groups.length - 1].entries.push(entry);
    });
    list.innerHTML = groups.map(group => `
        <section>
            <h3 class="block-toggle mb-2">${escapeHtml(group.label)}</h3>
            <div class="space-y-1.5">
                ${group.entries.map(entry => {
                    const type = ACTIVITY_TYPES[entry.type];
                    return `
                        <div class="glass-inset rounded-xl px-3 py-2.5 flex items-center gap-3">
                            <span class="w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACTIVITY_TONES[type.tone]}"><i class="fa-solid ${type.icon} text-xs" aria-hidden="true"></i></span>
                            <div class="min-w-0 flex-1">
                                <div class="text-sm truncate"><span class="font-semibold">${escapeHtml(entry.name || entry.email)}</span> ${escapeHtml(type.text(entry.target || ''))}</div>
                                <div class="text-[11px] text-muted truncate">${escapeHtml(entry.email)}${entry.client ? ` · ${escapeHtml(entry.client)}` : ''}</div>
                            </div>
                            <time class="text-[11px] text-muted shrink-0 font-mono" datetime="${escapeHtml(entry.at.toISOString())}">${escapeHtml(entry.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</time>
                        </div>
                    `;
                }).join('')}
            </div>
        </section>
    `).join('');
}

// ==========================================
// DIALOGS: confirm / choose / text prompt
// ==========================================
let choiceResolver = null;
let choiceValues = [];
let choiceReturnFocus = null;

function showChoiceDialog({ title, message = '', choices, input = null }) {
    if (choiceResolver) resolveChoice(null);
    choiceReturnFocus = document.activeElement;
    document.getElementById('choiceTitle').textContent = title;
    document.getElementById('choiceMessage').textContent = message;
    document.getElementById('choiceMessage').classList.toggle('hidden', !message);

    const inputWrap = document.getElementById('choiceInputWrap');
    const inputEl = document.getElementById('choiceInput');
    inputWrap.classList.toggle('hidden', !input);
    if (input) {
        document.getElementById('choiceInputLabel').textContent = input.label;
        inputEl.value = input.value || '';
        inputEl.placeholder = input.placeholder || '';
    }

    choiceValues = choices.map(c => c.value);
    document.getElementById('choiceButtons').innerHTML = choices.map((c, i) => `
        <button type="button" class="btn btn-${c.style || 'ghost'} h-10" onclick="resolveChoice(choiceValues[${i}])">${escapeHtml(c.label)}</button>
    `).join('');
    document.getElementById('choiceModal').classList.remove('hidden');
    setTimeout(() => {
        if (input) {
            inputEl.focus();
            inputEl.select();
        } else {
            document.querySelector('#choiceButtons button:last-child')?.focus();
        }
    }, 20);
    return new Promise(resolve => { choiceResolver = resolve; });
}

function resolveChoice(value) {
    document.getElementById('choiceModal').classList.add('hidden');
    const resolve = choiceResolver;
    choiceResolver = null;
    if (choiceReturnFocus && document.contains(choiceReturnFocus)) choiceReturnFocus.focus();
    choiceReturnFocus = null;
    if (resolve) resolve(value);
}

function askChoice({ title, message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, choices = null }) {
    return showChoiceDialog({
        title,
        message,
        choices: choices || [
            { label: cancelText, value: null, style: 'ghost' },
            { label: confirmText, value: true, style: danger ? 'danger' : 'primary' }
        ]
    });
}

async function askText({ title, message = '', label = 'Name', value = '', placeholder = '', confirmText = 'Save' }) {
    const result = await showChoiceDialog({
        title,
        message,
        input: { label, value, placeholder },
        choices: [
            { label: 'Cancel', value: null, style: 'ghost' },
            { label: confirmText, value: 'confirm', style: 'primary' }
        ]
    });
    return result === 'confirm' ? (document.getElementById('choiceInput').value.trim().slice(0, 40) || null) : null;
}

// ==========================================
// THEME & TOAST
// ==========================================
function syncThemeIcons(isDark) {
    document.querySelectorAll('.theme-icon-indicator').forEach(icon => {
        icon.className = `theme-icon-indicator fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`;
    });
    document.getElementById('themeColorMeta')?.setAttribute('content', isDark ? '#000000' : '#eef1f6');
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
    syncThemeIcons(isDark);
}

function checkSystemTheme() {
    // Default theme is light unless the user chose dark
    const isDark = localStorage.getItem(STORAGE_KEYS.theme) === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    syncThemeIcons(isDark);
}

let toastTimer = null;

function hideToast() {
    const toast = document.getElementById('toastNotification');
    toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
}

function showToast(message, { action = '', onAction = null, duration = 3200, error = false } = {}) {
    const toast = document.getElementById('toastNotification');
    const actionBtn = document.getElementById('toastAction');
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastIcon').className = error
        ? 'fa-solid fa-circle-exclamation text-rose-500'
        : 'fa-solid fa-circle-check text-emerald';
    if (action && onAction) {
        actionBtn.textContent = action;
        actionBtn.onclick = () => {
            hideToast();
            onAction();
        };
        actionBtn.classList.remove('hidden');
    } else {
        actionBtn.classList.add('hidden');
        actionBtn.onclick = null;
    }
    toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    // Restart the timer so a new toast isn't hidden early by the previous one's timeout
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, duration);
}

// ==========================================
// OFFLINE / PWA
// ==========================================
let deferredInstallPrompt = null;

function updateOnlineStatus() {
    document.getElementById('offlineBadge')?.classList.toggle('hidden', navigator.onLine);
}

async function promptInstallApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installAppLink')?.classList.add('hidden');
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || !window.location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker notice:', err.message));
}

// ==========================================
// GLOBAL LISTENERS & INIT
// ==========================================
function closeTopmostLayer() {
    if (isOpen('choiceModal')) { resolveChoice(null); return true; }
    if (isOpen('commandPalette')) { closeCommandPalette(); return true; }
    if (isOpen('cardMenu')) { closeCardMenu({ restoreFocus: true }); return true; }
    if (isOpen('iconPickerDropdown')) { closeIconPickerDropdown(); return true; }
    if (isOpen('qrModal')) { closeQrModal(); return true; }
    if (isOpen('activityModal')) { closeActivityModal(); return true; }
    if (isOpen('appModal')) { closeAddAppModal(); return true; }
    if (isOpen('settingsModal')) { closeSettingsModal(); return true; }
    if (isOpen('accessRequestsModal')) { closeAccessRequestsModal(); return true; }
    if (isOpen('userDropdownMenu')) { toggleUserDropdown(); return true; }
    return false;
}

function isAnyOverlayOpen() {
    return ['choiceModal', 'commandPalette', 'cardMenu', 'qrModal', 'activityModal', 'appModal', 'settingsModal', 'accessRequestsModal']
        .some(isOpen);
}

function reloadStateFromStorage() {
    categories = readStored(STORAGE_KEYS.categories, categories);
    dashboards = (readStored(STORAGE_KEYS.dashboards, dashboards) || []).map(normalizeDashboard).filter(Boolean);
    if (!dashboards.length) dashboards = clone(defaultDashboards);
    apps = (readStored(STORAGE_KEYS.apps, []) || []).map(normalizeApp);
    if (!dashboards.some(d => d.id === activeDashboardId)) activeDashboardId = dashboards[0].id;
}

function setupGlobalListeners() {
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            if (!isApprovedUser()) return;
            e.preventDefault();
            if (isOpen('commandPalette')) closeCommandPalette();
            else openCommandPalette(currentActiveApp ? 'switch' : 'default');
            return;
        }
        if (e.key === 'Escape') {
            if (closeTopmostLayer()) e.preventDefault();
            return;
        }
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            const search = document.getElementById('dashboardSearchInput');
            if (isOpen('dashboardHomeView') && search && !isAnyOverlayOpen()) {
                e.preventDefault();
                search.focus();
                search.select();
            }
        }
    });

    // Close menus and pickers on outside click
    document.addEventListener('click', e => {
        const menu = document.getElementById('cardMenu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) closeCardMenu();
        const iconPickerWrapper = document.getElementById('iconPickerWrapper');
        if (isOpen('iconPickerDropdown') && iconPickerWrapper && !iconPickerWrapper.contains(e.target)) closeIconPickerDropdown();
    });
    document.getElementById('dashboardHomeView')?.addEventListener('scroll', () => closeCardMenu(), { passive: true });
    window.addEventListener('resize', () => closeCardMenu());

    // Another tab changed the apps: pick up the change
    window.addEventListener('storage', e => {
        if ([STORAGE_KEYS.apps, STORAGE_KEYS.dashboards, STORAGE_KEYS.categories].includes(e.key)) {
            reloadStateFromStorage();
            renderDashboard();
        }
    });

    window.addEventListener('online', () => {
        updateOnlineStatus();
        showToast('Back online');
    });
    window.addEventListener('offline', () => {
        updateOnlineStatus();
        showToast("You're offline. Apps on your local network still work.", { error: true, duration: 5000 });
    });

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredInstallPrompt = e;
        document.getElementById('installAppLink')?.classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        document.getElementById('installAppLink')?.classList.add('hidden');
        showToast('PortalHub installed');
    });
}

// Builds the UI from saved state. Runs at the end of the page (the DOM above is already parsed),
// so the sign-in screen or dashboard never waits on Firebase, fonts, or icon downloads.
function initPortal() {
    // Remove previous sample Ipon app if present
    apps = apps.filter(a => !(a.id === 'ipon' && (a.url || '').includes('ipon-pse-portfolio')));
    // Remove Finance category if it was from previous default and has no apps
    if (!apps.some(a => a.category === 'Finance') && categories.includes('Finance')) {
        categories = categories.filter(c => c !== 'Finance');
    }
    // Auto-heal any previously stored URLs corrupted with https://file:///
    apps.forEach(app => {
        if (/^https?:\/\/file:\/\/\/?/i.test(app.url)) app.url = app.url.replace(/^https?:\/\/file:\/\/\/?/i, 'file:///');
    });
    // Persist the normalized data. Sample apps are written on the first run only,
    // so deleted samples and "Start empty" stay that way after a reload.
    saveApps();
    saveCategories();
    saveDashboards();

    checkSystemTheme();
    updateAuthUI();
    setupCrossTabSyncAndAutoRefresh();
    renderDashboard();
    setupCarouselEventListeners();
    setupGlobalListeners();
    updateOnlineStatus();
    checkLocalServerStatus();
    detectGateway();

    const hint = document.getElementById('paletteShortcutHint');
    if (hint && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) hint.textContent = '⌘K';
}

initPortal();

// The Firebase SDKs are deferred, and deferred scripts run just before DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    initFirebase();
    updateAuthUI();
});

window.addEventListener('load', registerServiceWorker);
