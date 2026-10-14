// ==========================================
// AUTHENTICATION & ACCESS CONTROL SYSTEM (FIREBASE READY)
// ==========================================
const MAIN_ADMIN_EMAIL = 'felixpareja.pmdit07@gmail.com';

const DEFAULT_FIREBASE_CONFIG = {
    projectId: "portalhub-f3221",
    appId: "1:856377438185:web:76cad3031685fdf718e578",
    storageBucket: "portalhub-f3221.firebasestorage.app",
    apiKey: "AIzaSyAuDuhlsKwj7UUyeyaBkrIFGaV9SiMTfKA",
    authDomain: "portalhub-f3221.firebaseapp.com",
    messagingSenderId: "856377438185",
    measurementId: "G-7D9H20MZQ4"
};

let currentUser = JSON.parse(localStorage.getItem('portal_auth_user')) || null;
let approvedUsers = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];
let pendingRequests = JSON.parse(localStorage.getItem('portal_access_requests')) || [];

function isCurrentUserAdmin() {
    return !!(currentUser && (currentUser.role === 'admin' || (currentUser.email && currentUser.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())));
}

// Auto-migrate from old project config if present in client localStorage
let savedConfig = JSON.parse(localStorage.getItem('portal_firebase_config'));
if (!savedConfig || savedConfig.projectId === 'ipon-pse-portfolio' || !savedConfig.apiKey) {
    savedConfig = DEFAULT_FIREBASE_CONFIG;
    localStorage.setItem('portal_firebase_config', JSON.stringify(DEFAULT_FIREBASE_CONFIG));
}
let firebaseConfig = savedConfig;
let isFirebaseActive = false;
let isRegisterMode = false;

// Ensure Admin is always in approved list
if (!approvedUsers.includes(MAIN_ADMIN_EMAIL)) {
    approvedUsers.unshift(MAIN_ADMIN_EMAIL);
    localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));
}

// Initialize Firebase when configured
function initFirebase() {
    const badge = document.getElementById('firebaseStatusBadge');

    if (window.firebase && firebaseConfig && firebaseConfig.apiKey) {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            isFirebaseActive = true;
            if (badge) {
                badge.innerText = 'Connected';
                badge.className = 'chip chip-emerald';
            }

            // Attach Firebase Auth state listener. Firestore rules require a signed-in user, so
            // the real-time listeners attach only once Firebase has restored the session.
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    syncFromFirestore();
                } else {
                    detachFirestoreListeners();
                }
                if (user && !currentUser) {
                    processUserLogin({
                        name: user.displayName || user.email.split('@')[0],
                        email: user.email,
                        picture: user.photoURL || '',
                        uid: user.uid
                    });
                }
            });

            // Check for redirect sign-in result if popup was blocked
            firebase.auth().getRedirectResult().then(result => {
                if (result && result.user) {
                    processUserLogin({
                        name: result.user.displayName || result.user.email.split('@')[0],
                        email: result.user.email,
                        picture: result.user.photoURL || '',
                        uid: result.user.uid
                    });
                }
            }).catch(err => console.log('Redirect result notice:', err));

            // Ensure unapproved users remain in pending status awaiting admin approval
            if (currentUser && !isCurrentUserAdmin() && currentUser.role !== 'guest') {
                const userEm = (currentUser.email || '').toLowerCase().trim();
                if (!approvedUsers.some(u => (u || '').toLowerCase().trim() === userEm)) {
                    currentUser.status = 'pending';
                    currentUser.role = 'requester';
                    localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
                }
            }
        } catch(e) {
            console.warn('Firebase init notice:', e);
        }
    } else {
        if (badge) {
            badge.innerText = 'Not connected';
            badge.className = 'chip chip-amber';
        }
    }
}

let firestoreReqUnsubscribe = null;
let firestoreUsersUnsubscribe = null;

function detachFirestoreListeners() {
    if (firestoreReqUnsubscribe) firestoreReqUnsubscribe();
    if (firestoreUsersUnsubscribe) firestoreUsersUnsubscribe();
    firestoreReqUnsubscribe = null;
    firestoreUsersUnsubscribe = null;
}

// Sync with Firestore collection in real-time
function syncFromFirestore() {
    if (!isFirebaseActive || !window.firebase || !firebase.firestore || !firebase.auth().currentUser) return;
    try {
        const db = firebase.firestore();

        // Real-time listener for pending access requests (admin only: rules deny listing to members)
        if (!firestoreReqUnsubscribe && isCurrentUserAdmin()) {
            firestoreReqUnsubscribe = db.collection('access_requests').onSnapshot(snapshot => {
                const currentApproved = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];
                const cloudReqs = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const em = (data.email || '').toLowerCase().trim();

                    // Only include if status is pending AND email is NOT in approvedUsers
                    if (data.status === 'pending' && em && !currentApproved.some(u => (u || '').toLowerCase().trim() === em)) {
                        cloudReqs.push({ id: doc.id, ...data, email: em });
                    }
                });

                // Keep unique requests that are strictly pending and not approved
                const mergedMap = new Map();
                cloudReqs.forEach(r => mergedMap.set(r.email, r));

                pendingRequests = Array.from(mergedMap.values());
                localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));
                updateAuthUI();
                if (document.getElementById('accessRequestsModal') && !document.getElementById('accessRequestsModal').classList.contains('hidden')) {
                    renderAccessRequestsList();
                }
            }, err => {
                // A failed listener is closed by Firestore; clear it so the next sign-in re-attaches
                firestoreReqUnsubscribe = null;
                console.log('Firestore access requests real-time sync notice:', err.message);
            });
        }

        // Real-time listener for approved users
        if (!firestoreUsersUnsubscribe) {
            firestoreUsersUnsubscribe = db.collection('portal_settings').doc('access_control').onSnapshot(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (Array.isArray(data.approvedUsers)) {
                        approvedUsers = data.approvedUsers;
                        if (!approvedUsers.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
                            approvedUsers.unshift(MAIN_ADMIN_EMAIL);
                        }
                        localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));

                        // Remove any pending requests that are now in approvedUsers
                        pendingRequests = (JSON.parse(localStorage.getItem('portal_access_requests')) || []).filter(r =>
                            r && r.status === 'pending' &&
                            !approvedUsers.some(u => (u || '').toLowerCase().trim() === (r.email || '').toLowerCase().trim())
                        );
                        localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

                        // Keep pending/approved state synchronized in real-time
                        if (currentUser && !isCurrentUserAdmin() && currentUser.role !== 'guest') {
                            const myEmail = (currentUser.email || '').toLowerCase().trim();
                            if (approvedUsers.some(u => (u || '').toLowerCase().trim() === myEmail)) {
                                if (currentUser.status !== 'approved') {
                                    currentUser.status = 'approved';
                                    currentUser.role = 'member';
                                    localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
                                    showToast('Access Approved by Admin! Entering PortalHub...');
                                }
                            } else {
                                currentUser.status = 'pending';
                                currentUser.role = 'requester';
                                localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
                            }
                        }

                        updateAuthUI();
                        if (document.getElementById('accessRequestsModal') && !document.getElementById('accessRequestsModal').classList.contains('hidden')) {
                            renderAccessRequestsList();
                        }
                    }
                }
            }, err => {
                firestoreUsersUnsubscribe = null;
                console.log('Firestore access control real-time sync notice:', err.message);
            });
        }
    } catch(err) {
        console.log('Firestore sync setup notice:', err);
    }
}

// ==========================================
// REAL-TIME AUTO-REFRESH & CROSS-TAB SYNC
// ==========================================
let portalSyncChannel = null;

function notifyAccessRequestsChanged() {
    try {
        if (portalSyncChannel) {
            portalSyncChannel.postMessage({ type: 'ACCESS_REQUEST_UPDATED', timestamp: Date.now() });
        }
    } catch(e) {}
    try {
        window.dispatchEvent(new CustomEvent('portal_sync_update'));
    } catch(e) {}
}

function setupCrossTabSyncAndAutoRefresh() {
    try {
        if (typeof BroadcastChannel !== 'undefined' && !portalSyncChannel) {
            portalSyncChannel = new BroadcastChannel('portalhub_requests_channel');
            portalSyncChannel.onmessage = function(ev) {
                if (ev && ev.data && ev.data.type === 'ACCESS_REQUEST_UPDATED') {
                    refreshPendingRequestsState();
                }
            };
        }
    } catch(e) {}

    // Immediate reaction to storage changes from another tab/window
    window.addEventListener('storage', function(e) {
        if (!e.key || e.key.includes('portal_access_requests') || e.key.includes('portal_approved_users') || e.key.includes('portal_auth_user')) {
            refreshPendingRequestsState();
        }
    });

    window.addEventListener('portal_sync_update', function() {
        refreshPendingRequestsState();
    });

    // Automatic live background refresh every 3 seconds for updated requests
    // (local state only; the Firestore onSnapshot listeners deliver cloud changes in real time)
    setInterval(function() {
        refreshPendingRequestsState();
    }, 3000);
}

// Fallback server poll for the admin, throttled: every Firestore get() bills one read per document
const FIRESTORE_POLL_INTERVAL_MS = 30000;
let lastFirestorePollAt = 0;

async function refreshPendingRequestsState(forceServerCheck = false) {
    try {
        const rawApproved = localStorage.getItem('portal_approved_users');
        const localApproved = JSON.parse(rawApproved) || [MAIN_ADMIN_EMAIL];
        if (!localApproved.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
            localApproved.unshift(MAIN_ADMIN_EMAIL);
        }
        approvedUsers = localApproved;

        // Keep logged in user state synchronized with approvedUsers in real-time
        if (currentUser && !isCurrentUserAdmin() && currentUser.role !== 'guest') {
            const myEmail = (currentUser.email || '').toLowerCase().trim();
            if (approvedUsers.some(u => (u || '').toLowerCase().trim() === myEmail)) {
                if (currentUser.status !== 'approved') {
                    currentUser.status = 'approved';
                    currentUser.role = 'member';
                    localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
                    showToast('Access Approved by Admin! Entering PortalHub...');
                }
            } else {
                currentUser.status = 'pending';
                currentUser.role = 'requester';
                localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
            }
        }

        const rawRequests = localStorage.getItem('portal_access_requests');
        let localReqs = (JSON.parse(rawRequests) || []).filter(r =>
            r && r.status === 'pending' &&
            !approvedUsers.some(u => (u || '').toLowerCase().trim() === (r.email || '').toLowerCase().trim())
        );

        // If Firebase is active and user is admin: poll Firestore directly to catch requests from other devices/browsers
        const isAdmin = isCurrentUserAdmin();
        const pollDue = forceServerCheck || Date.now() - lastFirestorePollAt >= FIRESTORE_POLL_INTERVAL_MS;
        if (isFirebaseActive && window.firebase && firebase.firestore && isAdmin && pollDue) {
            lastFirestorePollAt = Date.now();
            try {
                const db = firebase.firestore();
                const snapshot = await db.collection('access_requests').get();
                let hasChanges = false;
                snapshot.forEach(doc => {
                    const r = doc.data();
                    const em = (r.email || '').toLowerCase().trim();

                    if (r && r.status === 'pending' && em && !approvedUsers.some(u => (u || '').toLowerCase().trim() === em)) {
                        if (!localReqs.some(lr => (lr.email || '').toLowerCase().trim() === em)) {
                            localReqs.unshift({ id: doc.id, ...r, email: em });
                            hasChanges = true;
                        }
                    }
                });
                if (hasChanges) {
                    pendingRequests = localReqs;
                    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));
                }
            } catch(e) {}
        }

        pendingRequests = localReqs;
        updateAuthUI();

        const reqModal = document.getElementById('accessRequestsModal');
        if (reqModal && !reqModal.classList.contains('hidden')) {
            renderAccessRequestsList();
        }
    } catch(e) {}
}

// 1. Google Sign-In with Real Google Account Popup (No prompt dialogs)
async function handleGoogleSignIn() {
    try {
        if (!window.firebase) {
            showToast('Loading Google Authentication services...');
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig || DEFAULT_FIREBASE_CONFIG);
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        showToast('Opening Google Sign-In...');
        const result = await firebase.auth().signInWithPopup(provider);
        if (result && result.user) {
            processUserLogin({
                name: result.user.displayName || result.user.email.split('@')[0],
                email: result.user.email,
                picture: result.user.photoURL || '',
                uid: result.user.uid
            });
        }
    } catch(err) {
        console.warn('Google Sign-In notice:', err);
        if (err.code === 'auth/popup-closed-by-user') {
            showToast('Google Sign-In cancelled');
        } else if (err.code === 'auth/popup-blocked') {
            showToast('Popup was blocked by your browser. Redirecting to Google Sign-In...');
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            firebase.auth().signInWithRedirect(provider);
        } else if (err.code === 'auth/unauthorized-domain') {
            const domain = window.location.hostname;
            showToast(`Domain "${domain}" is not authorized in Firebase Console.`);
            alert(`Firebase Authentication Notice:\n\nThe domain "${domain}" is not yet in your Firebase authorized domains list.\n\nTo allow Google Sign-In here:\n1. Open Firebase Console (https://console.firebase.google.com/project/portalhub-f3221/authentication/settings)\n2. Navigate to "Settings" -> "Authorized domains"\n3. Click "Add domain" and add "${domain}"\n4. Refresh this page to sign in!`);
        } else {
            showToast(err.message || 'Google Sign-In failed');
        }
    }
}

// 2. Email / Password Submit (Sign In or Register)
async function handleEmailAuthSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('authEmailInput');
    const passwordInput = document.getElementById('authPasswordInput');
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) return;

    if (isFirebaseActive && window.firebase) {
        try {
            if (isRegisterMode) {
                const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
                processUserLogin({
                    name: email.split('@')[0],
                    email: email,
                    picture: '',
                    uid: cred.user.uid
                });
            } else {
                const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
                processUserLogin({
                    name: cred.user.displayName || email.split('@')[0],
                    email: email,
                    picture: '',
                    uid: cred.user.uid
                });
            }
            return;
        } catch(err) {
            console.warn('Firebase Auth error:', err);
            showToast(err.message || 'Authentication error');
            return;
        }
    }

    // Standalone / Offline Auth execution
    const displayName = email.split('@')[0];
    processUserLogin({
        name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        email: email,
        picture: ''
    });
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const submitText = document.getElementById('authSubmitText');
    const toggleBtn = document.getElementById('toggleAuthModeBtn');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (isRegisterMode) {
        if (submitText) submitText.innerText = 'Register & request access';
        if (toggleBtn) toggleBtn.innerText = 'Already have an account? Sign in';
        if (submitBtn) submitBtn.className = 'btn btn-success w-full h-11';
    } else {
        if (submitText) submitText.innerText = 'Sign in';
        if (toggleBtn) toggleBtn.innerText = "Don't have an account? Request access";
        if (submitBtn) submitBtn.className = 'btn btn-primary w-full h-11';
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById('authPasswordInput');
    const icon = document.getElementById('passwordEyeIcon');
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-regular fa-eye-slash text-sm text-blue-600 dark:text-blue-400';
    } else {
        input.type = 'password';
        icon.className = 'fa-regular fa-eye text-sm';
    }
}

function handleForgotPassword() {
    const emailInput = document.getElementById('authEmailInput');
    const email = (emailInput ? emailInput.value.trim() : '') || prompt("Enter your account email for password reset:");
    if (!email) return;

    if (isFirebaseActive && window.firebase) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => showToast(`Password reset link sent to ${email}`))
            .catch(err => showToast(err.message || 'Error sending reset email'));
    } else {
        showToast('Password reset needs a connection to Firebase. Try again when online.');
    }
}

async function processUserLogin(userData) {
    userData.email = (userData.email || '').toLowerCase().trim();
    const isAdmin = userData.email === MAIN_ADMIN_EMAIL.toLowerCase();
    const isGuest = userData.role === 'guest';

    approvedUsers = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];
    if (!approvedUsers.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
        approvedUsers.unshift(MAIN_ADMIN_EMAIL);
    }

    const isApproved = isAdmin || isGuest || approvedUsers.some(u => (u || '').toLowerCase().trim() === userData.email);

    if (isApproved) {
        userData.role = isAdmin ? 'admin' : (isGuest ? 'guest' : 'member');
        userData.status = 'approved';
        currentUser = userData;
        localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
        showToast(isAdmin ? 'Welcome back, Admin Felix!' : `Welcome back, ${userData.name}!`);
        logAudit('sign_in');
        // The admin also needs the access-requests listener, which members don't get
        syncFromFirestore();

        if (isAdmin) {
            setTimeout(() => {
                const curPending = JSON.parse(localStorage.getItem('portal_access_requests')) || [];
                if (curPending.length > 0) {
                    openAccessRequestsModal();
                }
            }, 500);
        }
        updateAuthUI();
        notifyAccessRequestsChanged();
    } else {
        // NOT AN APPROVED MEMBER:
        // 1. Clear any prior decline record so new request is active and visible
        let rawDeclined = localStorage.getItem('portal_declined_users');
        let declinedList = JSON.parse(rawDeclined) || [];
        declinedList = declinedList.filter(u => (u || '').toLowerCase().trim() !== userData.email);
        localStorage.setItem('portal_declined_users', JSON.stringify(declinedList));

        // 2. Submit/refresh access request in Firestore
        const cleanDocId = 'req-' + userData.email.replace(/[^a-zA-Z0-9]/g, '_');
        const now = new Date();
        const options = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
        const formattedDate = now.toLocaleString('en-US', options);

        const newReq = {
            id: cleanDocId,
            name: userData.name || userData.email.split('@')[0],
            email: userData.email,
            picture: userData.picture || '',
            requestedAt: formattedDate,
            status: 'pending'
        };

        // Add to local pendingRequests
        pendingRequests = (JSON.parse(localStorage.getItem('portal_access_requests')) || []).filter(r => (r.email || '').toLowerCase().trim() !== userData.email);
        pendingRequests.unshift(newReq);
        localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

        // Always sync directly to Firestore access_requests collection so Admin receives the request.
        // (Only the admin may edit portal_settings, so the admin's approval clears any old decline.)
        if (window.firebase) {
            try {
                const db = firebase.firestore();
                await db.collection('access_requests').doc(cleanDocId).set(newReq, { merge: true });
                console.log('Access request successfully synced to Firestore:', cleanDocId);
            } catch(e) {
                console.warn('Error saving access request to Firestore:', e);
            }
        }

        // 3. Keep user in pending state and show Awaiting Approval Screen (DO NOT ENTER DASHBOARD)
        userData.role = 'requester';
        userData.status = 'pending';
        currentUser = userData;
        localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
        logAudit('access_request');

        showToast('Access request submitted! Awaiting Admin approval.');
        updateAuthUI();
        notifyAccessRequestsChanged();
    }
}

async function checkApprovalStatus() {
    if (!currentUser) return;
    approvedUsers = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];

    showToast('Checking approval status with cloud...');

    // Fetch live from Firestore
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();
            const doc = await db.collection('portal_settings').doc('access_control').get();
            if (doc.exists) {
                const data = doc.data();
                if (Array.isArray(data.approvedUsers)) {
                    approvedUsers = data.approvedUsers;
                    if (!approvedUsers.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
                        approvedUsers.unshift(MAIN_ADMIN_EMAIL);
                    }
                    localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));
                }
            }
        } catch(e) { console.log('Check status notice:', e); }
    }

    if (approvedUsers.some(u => u.toLowerCase() === (currentUser.email || '').toLowerCase())) {
        currentUser.status = 'approved';
        currentUser.role = currentUser.email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'member';
        localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));
        showToast('Access Approved by Admin! Entering PortalHub...');
        updateAuthUI();
    } else {
        showToast('Still awaiting approval from ' + MAIN_ADMIN_EMAIL);
    }
}

async function signOutAuth() {
    // Record the sign-out while still authenticated (the rules only accept writes from signed-in users)
    await Promise.race([logAudit('sign_out'), new Promise(resolve => setTimeout(resolve, 1500))]);
    detachFirestoreListeners();
    if (isFirebaseActive && window.firebase && firebase.auth) {
        try { firebase.auth().signOut(); } catch(e) {}
    }
    if (typeof returnToDashboard === 'function' && currentActiveApp) returnToDashboard();
    currentUser = null;
    localStorage.removeItem('portal_auth_user');
    const dropdown = document.getElementById('userDropdownMenu');
    if (dropdown) dropdown.classList.add('hidden');
    showToast('Signed out successfully');
    updateAuthUI();
}

function saveFirebaseConfig() {
    if (!isCurrentUserAdmin()) {
        showToast('Admin access required to modify Firebase configuration');
        return;
    }
    const textarea = document.getElementById('firebaseConfigTextarea');
    const val = textarea.value.trim();
    if (!val) {
        showToast('Please enter valid Firebase configuration');
        return;
    }

    try {
        const parsed = JSON.parse(val);
        firebaseConfig = parsed;
        localStorage.setItem('portal_firebase_config', JSON.stringify(firebaseConfig));
        showToast('Firebase configuration saved!');
        initFirebase();
    } catch(err) {
        showToast('Invalid JSON format for Firebase configuration');
    }
}

function loadDefaultFirebaseSample() {
    if (!isCurrentUserAdmin()) {
        showToast('Admin access required to modify Firebase configuration');
        return;
    }
    const textarea = document.getElementById('firebaseConfigTextarea');
    if (textarea) textarea.value = JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
}

function clearFirebaseConfig() {
    if (!isCurrentUserAdmin()) {
        showToast('Admin access required to modify Firebase configuration');
        return;
    }
    localStorage.removeItem('portal_firebase_config');
    firebaseConfig = null;
    const textarea = document.getElementById('firebaseConfigTextarea');
    if (textarea) textarea.value = '';
    showToast('Firebase configuration cleared');
    initFirebase();
}

function updateAuthUI() {
    const signInView = document.getElementById('authSignInView');
    const pendingView = document.getElementById('authPendingView');
    const dashboardView = document.getElementById('dashboardHomeView');
    const activeAppView = document.getElementById('activeAppView');
    const header = document.querySelector('header');
    const navReqBtn = document.getElementById('navAccessRequestsBtn');
    const pendingBadge = document.getElementById('navPendingBadge');
    const dropdownBadge = document.getElementById('dropdownPendingBadge');

    // Refresh pending requests, approved users, and declined users from storage
    approvedUsers = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];
    if (!approvedUsers.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
        approvedUsers.unshift(MAIN_ADMIN_EMAIL);
    }

    // Filter pending requests strictly against approvedUsers
    pendingRequests = (JSON.parse(localStorage.getItem('portal_access_requests')) || []).filter(r =>
        r && r.status === 'pending' &&
        !approvedUsers.some(u => (u || '').toLowerCase().trim() === (r.email || '').toLowerCase().trim())
    );
    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

    const pendingCount = pendingRequests.length;
    if (pendingBadge) {
        pendingBadge.innerText = pendingCount;
        pendingBadge.classList.toggle('hidden', pendingCount === 0);
    }
    if (dropdownBadge) dropdownBadge.innerText = pendingCount;

    if (!currentUser) {
        // Not signed in
        if (signInView) signInView.classList.remove('hidden');
        if (pendingView) pendingView.classList.add('hidden');
        if (dashboardView) dashboardView.classList.add('hidden');
        if (activeAppView) activeAppView.classList.add('hidden');
        if (header) header.classList.add('hidden');
        return;
    }

    // AUTH CHECK: Ensure logged-in user is an approved member!
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    const isAdmin = isCurrentUserAdmin();
    const isGuest = currentUser.role === 'guest';
    const isApproved = isAdmin || isGuest || approvedUsers.some(u => (u || '').toLowerCase().trim() === userEmail);

    if (!isApproved) {
        // User is NOT an approved member: SHOW PENDING SCREEN ONLY, KEEP DASHBOARD & HEADER HIDDEN
        currentUser.status = 'pending';
        currentUser.role = 'requester';
        localStorage.setItem('portal_auth_user', JSON.stringify(currentUser));

        if (signInView) signInView.classList.add('hidden');
        if (pendingView) pendingView.classList.remove('hidden');
        if (dashboardView) dashboardView.classList.add('hidden');
        if (activeAppView) activeAppView.classList.add('hidden');
        if (header) header.classList.add('hidden');
        const userMenu = document.getElementById('userDropdownMenu');
        if (userMenu) userMenu.classList.add('hidden');

        const emailDisp = document.getElementById('pendingUserEmailDisplay');
        if (emailDisp) emailDisp.innerText = currentUser.email;

        const letterDisp = document.getElementById('pendingAvatarLetter');
        if (letterDisp) letterDisp.innerText = (currentUser.name || currentUser.email).charAt(0).toUpperCase();

        if (navReqBtn) navReqBtn.classList.add('hidden');
        return;
    }

    // User is approved: show header and dashboard
    if (header) header.classList.remove('hidden');
    if (signInView) signInView.classList.add('hidden');
    if (pendingView) pendingView.classList.add('hidden');
    if (!currentActiveApp) {
        if (dashboardView) dashboardView.classList.remove('hidden');
    }

    // Update user avatar & menu
    const navInitial = document.getElementById('navAvatarInitial');
    const menuInitial = document.getElementById('menuAvatarInitial');
    const menuName = document.getElementById('menuUserName');
    const menuEmail = document.getElementById('menuUserEmail');
    const menuRole = document.getElementById('menuRoleBadge');
    const menuReqLink = document.getElementById('menuAccessRequestsLink');

    const initial = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
    if (navInitial) navInitial.innerText = initial;
    if (menuInitial) menuInitial.innerText = initial;
    if (menuName) menuName.innerText = currentUser.name || 'Portal User';
    if (menuEmail) menuEmail.innerText = currentUser.email;
    if (menuRole) {
        menuRole.className = isAdmin ? 'chip chip-emerald' : 'chip chip-blue';
        menuRole.innerHTML = isAdmin
            ? '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Administrator'
            : '<i class="fa-solid fa-user" aria-hidden="true"></i> Member';
    }

    // Firebase & Firestore Configuration: Visible ONLY for Admin
    const fbSection = document.getElementById('firebaseSettingsSection');
    const fbDivider = document.getElementById('firebaseSettingsDivider');
    const fbArea = document.getElementById('firebaseConfigTextarea');
    if (fbSection) {
        if (isAdmin) {
            fbSection.classList.remove('hidden');
            if (fbArea && firebaseConfig) fbArea.value = JSON.stringify(firebaseConfig, null, 2);
        } else {
            fbSection.classList.add('hidden');
            if (fbArea) fbArea.value = '';
        }
    }
    if (fbDivider) {
        if (isAdmin) fbDivider.classList.remove('hidden');
        else fbDivider.classList.add('hidden');
    }

    if (navReqBtn) {
        navReqBtn.classList.toggle('hidden', !isAdmin);
        navReqBtn.classList.toggle('flex', isAdmin);
        navReqBtn.title = pendingCount > 0 ? `Access requests (${pendingCount} waiting)` : 'Access requests';
    }

    if (menuReqLink) {
        if (isAdmin) menuReqLink.classList.remove('hidden');
        else menuReqLink.classList.add('hidden');
    }

    // Activity log is admin-only
    ['navActivityBtn', 'menuActivityLink'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('hidden', !isAdmin);
            el.classList.toggle('flex', isAdmin);
        }
    });

    // Admin Pending Requests Alert Banner in Dashboard
    const adminBanner = document.getElementById('adminPendingAlertBanner');
    const bannerCount = document.getElementById('adminPendingBannerCount');
    const bannerDetail = document.getElementById('adminPendingBannerDetail');

    if (isAdmin && pendingCount > 0) {
        if (adminBanner) adminBanner.classList.remove('hidden');
        if (bannerCount) bannerCount.innerText = pendingCount;
        if (bannerDetail) {
            const firstReq = pendingRequests[0];
            bannerDetail.innerHTML = `<span class="font-semibold">${escapeHtml(firstReq.email)}</span> ${pendingCount > 1 ? `and ${pendingCount - 1} other${pendingCount > 2 ? 's' : ''}` : ''} requested access.`;
        }
    } else {
        if (adminBanner) adminBanner.classList.add('hidden');
    }

    renderGreeting();
}

function toggleUserDropdown() {
    const menu = document.getElementById('userDropdownMenu');
    if (menu) menu.classList.toggle('hidden');
}

// Close user dropdown on outside click
document.addEventListener('click', function(e) {
    const container = document.getElementById('userMenuContainer');
    const menu = document.getElementById('userDropdownMenu');
    if (container && menu && !container.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// ==========================================
// ADMIN ACCESS REQUESTS MODAL (Images 2 & 3)
// ==========================================
function openAccessRequestsModal() {
    renderAccessRequestsList();
    document.getElementById('accessRequestsModal').classList.remove('hidden');
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        refreshPendingRequestsState(true);
    }
}

function closeAccessRequestsModal() {
    document.getElementById('accessRequestsModal').classList.add('hidden');
    updateAuthUI();
}

function renderAccessRequestsList() {
    approvedUsers = JSON.parse(localStorage.getItem('portal_approved_users')) || [MAIN_ADMIN_EMAIL];
    if (!approvedUsers.some(u => u.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase())) {
        approvedUsers.unshift(MAIN_ADMIN_EMAIL);
    }

    // Exclude already approved users: all other pending requests MUST be visible to admin
    pendingRequests = (JSON.parse(localStorage.getItem('portal_access_requests')) || []).filter(r =>
        r && r.status === 'pending' &&
        !approvedUsers.some(u => (u || '').toLowerCase().trim() === (r.email || '').toLowerCase().trim())
    );
    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

    const container = document.getElementById('pendingRequestsContainer');
    const countBadge = document.getElementById('approvedMembersCount');
    const approvedList = document.getElementById('approvedMembersList');

    if (countBadge) countBadge.innerText = approvedUsers.length;

    // Render Pending Requests List
    if (pendingRequests.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center">
                <div class="w-12 h-12 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 text-lg">
                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                </div>
                <h4 class="text-sm font-semibold text-slate-900 dark:text-white">All requests processed</h4>
                <p class="text-xs text-muted mt-1">New requests appear here in real time.</p>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="space-y-2.5">
                ${pendingRequests.map(req => `
                    <div class="glass-inset rounded-2xl p-3.5 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-fuchsia-500 to-pink-600 text-white font-bold flex items-center justify-center shrink-0">
                                ${escapeHtml((req.name || req.email || '?').charAt(0).toUpperCase())}
                            </div>
                            <div class="min-w-0">
                                <h5 class="text-sm font-semibold text-slate-900 dark:text-white truncate">${escapeHtml(req.name || 'Family Member')}</h5>
                                <p class="text-xs text-accent truncate">${escapeHtml(req.email)}</p>
                                <p class="text-[11px] text-muted mt-0.5">Requested ${escapeHtml(req.requestedAt)}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button onclick="approveAccessRequest(${jsArg(req.id)}, ${jsArg(req.email)})" class="btn btn-success h-9 px-3 text-xs">
                                <i class="fa-solid fa-check" aria-hidden="true"></i>
                                <span>Approve</span>
                            </button>
                            <button onclick="declineAccessRequest(${jsArg(req.id)}, ${jsArg(req.email)})" class="btn btn-danger-soft h-9 px-3 text-xs">
                                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                                <span>Decline</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Render Approved Members List
    if (approvedList) {
        approvedList.innerHTML = approvedUsers.map(email => {
            const isMainAdmin = email.toLowerCase() === MAIN_ADMIN_EMAIL.toLowerCase();
            return `
                <div class="glass-inset flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-2 h-2 rounded-full shrink-0 ${isMainAdmin ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
                        <span class="text-slate-700 dark:text-slate-300 truncate">${escapeHtml(email)}</span>
                        ${isMainAdmin ? '<span class="chip chip-amber">Admin</span>' : ''}
                    </div>
                    ${isMainAdmin ? '' : `
                        <button onclick="revokeApprovedUser(${jsArg(email)})" title="Revoke access" aria-label="Revoke access for ${escapeHtml(email)}" class="icon-btn w-8 h-8 hover:!text-rose-500">
                            <i class="fa-solid fa-trash text-xs" aria-hidden="true"></i>
                        </button>
                    `}
                </div>
            `;
        }).join('');
    }
}

async function approveAccessRequest(reqId, reqEmail) {
    let targetEmail = (reqEmail || '').toLowerCase().trim();
    if (!targetEmail && reqId) {
        const found = pendingRequests.find(r => r.id === reqId);
        if (found && found.email) targetEmail = found.email.toLowerCase().trim();
    }
    if (!targetEmail) {
        showToast('Unable to identify request to approve');
        return;
    }

    // Remove from declined list if previously marked declined
    let rawDeclined = localStorage.getItem('portal_declined_users');
    let declinedUsers = JSON.parse(rawDeclined) || [];
    declinedUsers = declinedUsers.filter(u => u.toLowerCase() !== targetEmail);
    localStorage.setItem('portal_declined_users', JSON.stringify(declinedUsers));

    if (!approvedUsers.some(u => u.toLowerCase() === targetEmail)) {
        approvedUsers.push(targetEmail);
        localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));
    }

    // Purge ALL pending requests for this email!
    pendingRequests = pendingRequests.filter(r => (r.email || '').toLowerCase().trim() !== targetEmail && r.id !== reqId);
    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

    showToast(`Approved access for ${targetEmail}`);
    logAudit('approve', targetEmail);
    renderAccessRequestsList();
    updateAuthUI();
    notifyAccessRequestsChanged();

    // Sync to Firestore if available
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();
            await db.collection('portal_settings').doc('access_control').set({
                approvedUsers: approvedUsers,
                declinedUsers: declinedUsers
            }, { merge: true });

            const cleanDocId = 'req-' + targetEmail.replace(/[^a-zA-Z0-9]/g, '_');
            if (reqId) {
                db.collection('access_requests').doc(reqId).delete().catch(() => {});
            }
            db.collection('access_requests').doc(cleanDocId).delete().catch(() => {});

            const allReqs = await db.collection('access_requests').get();
            allReqs.forEach(doc => {
                const data = doc.data();
                if ((data.email || '').toLowerCase().trim() === targetEmail) {
                    doc.ref.delete().catch(() => {});
                }
            });
        } catch(e) { console.warn('Firestore approve sync notice:', e); }
    }
}

async function declineAccessRequest(reqId, reqEmail) {
    let targetEmail = (reqEmail || '').toLowerCase().trim();
    if (!targetEmail && reqId) {
        const found = pendingRequests.find(r => r.id === reqId);
        if (found && found.email) targetEmail = found.email.toLowerCase().trim();
    }

    if (!targetEmail) {
        showToast('Unable to identify request to decline');
        return;
    }

    // Remove from approvedUsers if present
    approvedUsers = approvedUsers.filter(u => (u || '').toLowerCase().trim() !== targetEmail);
    localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));

    // Remove from pendingRequests immediately
    pendingRequests = pendingRequests.filter(r =>
        (r.email || '').toLowerCase().trim() !== targetEmail && r.id !== reqId
    );
    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

    // Immediately update UI so the modal and dashboard reflect the removal instantly
    renderAccessRequestsList();
    updateAuthUI();
    const adminBanner = document.getElementById('adminPendingAlertBanner');
    if (adminBanner && pendingRequests.length === 0) adminBanner.classList.add('hidden');
    showToast(`Declined request for ${targetEmail}`);
    logAudit('decline', targetEmail);
    notifyAccessRequestsChanged();

    // Clean up Firestore in background: delete pending request docs
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();

            // Update access_control with updated approvedUsers
            await db.collection('portal_settings').doc('access_control').set({
                approvedUsers: approvedUsers
            }, { merge: true });

            const cleanDocId = 'req-' + targetEmail.replace(/[^a-zA-Z0-9]/g, '_');
            if (reqId) {
                db.collection('access_requests').doc(reqId).delete().catch(() => {});
            }
            db.collection('access_requests').doc(cleanDocId).delete().catch(() => {});

            // Delete any other docs in access_requests with this email
            const allReqs = await db.collection('access_requests').get();
            allReqs.forEach(doc => {
                const data = doc.data();
                if ((data.email || '').toLowerCase().trim() === targetEmail) {
                    doc.ref.delete().catch(() => {});
                }
            });
        } catch(e) {
            console.warn('Firestore decline cleanup notice:', e);
        }
    }
}

async function handlePreApproveSubmit(e) {
    e.preventDefault();
    const emailInput = document.getElementById('preApproveEmail');
    const nameInput = document.getElementById('preApproveName');
    const email = emailInput.value.trim().toLowerCase();
    const name = nameInput.value.trim();

    if (!email) return;

    if (approvedUsers.includes(email)) {
        showToast('User is already approved');
        return;
    }

    approvedUsers.push(email);
    localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));

    // Also clear if they had a pending request
    pendingRequests = pendingRequests.filter(r => r.email !== email);
    localStorage.setItem('portal_access_requests', JSON.stringify(pendingRequests));

    // Sync to Firestore if available
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();
            await db.collection('portal_settings').doc('access_control').set({ approvedUsers: approvedUsers }, { merge: true });
        } catch(e) { console.warn('Firestore pre-approve sync notice:', e); }
    }

    emailInput.value = '';
    nameInput.value = '';
    showToast(`Pre-approved ${name || email}!`);
    logAudit('pre_approve', email);
    renderAccessRequestsList();
    updateAuthUI();
    notifyAccessRequestsChanged();
}

async function revokeApprovedUser(email) {
    if (email === MAIN_ADMIN_EMAIL) return;
    const confirmed = await askChoice({
        title: 'Revoke access?',
        message: `${email} will be signed out and must request access again.`,
        confirmText: 'Revoke access',
        danger: true
    });
    if (!confirmed) return;

    const targetEmail = (email || '').toLowerCase().trim();
    logAudit('revoke', targetEmail);
    approvedUsers = approvedUsers.filter(e => (e || '').toLowerCase().trim() !== targetEmail);
    localStorage.setItem('portal_approved_users', JSON.stringify(approvedUsers));

    // If current user is the revoked user, automatically log out immediately
    if (currentUser && (currentUser.email || '').toLowerCase().trim() === targetEmail) {
        currentUser = null;
        localStorage.removeItem('portal_auth_user');
        if (window.firebase && firebase.auth) {
            try { firebase.auth().signOut(); } catch(e) {}
        }
    }

    // Sync to Firestore if available
    if (isFirebaseActive && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();
            await db.collection('portal_settings').doc('access_control').set({ approvedUsers: approvedUsers }, { merge: true });
        } catch(e) { console.warn('Firestore revoke sync notice:', e); }
    }

    showToast(`Revoked access for ${email}`);
    renderAccessRequestsList();
    updateAuthUI();
    notifyAccessRequestsChanged();
}

// ==========================================
// AUDIT LOG (sign-ins, access decisions, app opens)
// ==========================================
// Entries go to Firestore `audit_log` (write-once, admin-readable per firestore.rules) and to a
// short local history so the Activity view still works offline.
const AUDIT_LOCAL_KEY = 'portalhub_audit_local';
const AUDIT_LOCAL_LIMIT = 200;
const AUDIT_CLOUD_LIMIT = 150;

function describeClient() {
    const ua = navigator.userAgent || '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
    return `${browser} · ${os}`;
}

function logAudit(type, target = '') {
    const actor = currentUser || {};
    const entry = {
        type,
        email: (actor.email || '').toLowerCase().trim(),
        name: String(actor.name || '').slice(0, 120),
        target: String(target || '').slice(0, 300),
        client: describeClient()
    };
    if (!entry.email) return Promise.resolve();

    try {
        const local = JSON.parse(localStorage.getItem(AUDIT_LOCAL_KEY)) || [];
        local.unshift({ ...entry, at: new Date().toISOString() });
        localStorage.setItem(AUDIT_LOCAL_KEY, JSON.stringify(local.slice(0, AUDIT_LOCAL_LIMIT)));
    } catch(e) {}

    // Cloud copy only when the Firebase session belongs to the same person (the rules check this too)
    const authUser = isFirebaseActive && window.firebase && firebase.auth && firebase.auth().currentUser;
    if (!authUser || (authUser.email || '').toLowerCase() !== entry.email) return Promise.resolve();
    return firebase.firestore().collection('audit_log')
        .add({ ...entry, at: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(err => console.warn('Audit log notice:', err.message));
}

// Admin view: cloud history when connected, otherwise this device's local history
async function fetchAuditEntries() {
    const authUser = isFirebaseActive && window.firebase && firebase.auth && firebase.auth().currentUser;
    if (authUser && isCurrentUserAdmin()) {
        try {
            const snapshot = await firebase.firestore().collection('audit_log')
                .orderBy('at', 'desc').limit(AUDIT_CLOUD_LIMIT).get();
            return {
                source: 'cloud',
                entries: snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { ...data, at: data.at && data.at.toDate ? data.at.toDate() : new Date() };
                })
            };
        } catch(e) {
            console.warn('Audit log fetch notice:', e.message);
        }
    }
    const local = JSON.parse(localStorage.getItem(AUDIT_LOCAL_KEY) || '[]');
    return { source: 'local', entries: local.map(e => ({ ...e, at: new Date(e.at) })) };
}
