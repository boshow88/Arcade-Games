/*
 * ArcadeNet — thin Firebase layer for online play (ES module, no build step).
 *
 * Loads the modular Firebase SDK from the CDN, signs players in (Google primary,
 * anonymous guest fallback), and exposes room CRUD + realtime listening on
 * `window.ArcadeNet`. It is game-agnostic: duel-specific logic stays in the game.
 *
 * Fails gracefully: if the SDK or config can't load, `window.ArcadeNet` is set to
 * a stub with `ok:false`, and a `arcade-net-ready` event still fires so callers
 * can disable online play while the offline/vs-AI experience keeps working.
 */
const SDK = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${SDK}`;

function fail(err) {
    console.warn('[ArcadeNet] disabled:', err && (err.message || err));
    window.ArcadeNet = { ok: false, error: String(err && (err.message || err) || err) };
    window.dispatchEvent(new CustomEvent('arcade-net-ready'));
}

(async function boot() {
    try {
        if (!window.FIREBASE_READY || !window.FIREBASE_CONFIG) throw new Error('config not set');

        const [{ initializeApp }, authMod, fsMod] = await Promise.all([
            import(`${BASE}/firebase-app.js`),
            import(`${BASE}/firebase-auth.js`),
            import(`${BASE}/firebase-firestore.js`),
        ]);
        const {
            getAuth, onAuthStateChanged, signInAnonymously, signOut,
            GoogleAuthProvider, signInWithPopup,
        } = authMod;
        const {
            getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot,
            runTransaction, serverTimestamp, deleteField,
        } = fsMod;

        const app = initializeApp(window.FIREBASE_CONFIG);
        const auth = getAuth(app);
        const db = getFirestore(app);

        let user = undefined;                 // undefined = unknown yet, null = signed out
        const authCbs = [];
        onAuthStateChanged(auth, (u) => {
            user = u ? { uid: u.uid, name: u.displayName || null, photo: u.photoURL || null, anon: u.isAnonymous } : null;
            authCbs.forEach((fn) => { try { fn(user); } catch (e) { /* ignore */ } });
        });

        // --- room helpers ---
        const ROOMS = 'duel_rooms';
        const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
        function genCode(n) { let s = ''; for (let i = 0; i < (n || 4); i++) s += ALPHABET[(Math.random() * ALPHABET.length) | 0]; return s; }
        const roomRef = (code) => doc(db, ROOMS, code);

        async function createRoom(seed) {
            if (!user) throw new Error('not signed in');
            // try a few codes to dodge a rare collision
            for (let attempt = 0; attempt < 6; attempt++) {
                const code = genCode(4);
                const ref = roomRef(code);
                const ok = await runTransaction(db, async (tx) => {
                    const snap = await tx.get(ref);
                    if (snap.exists()) return false;
                    tx.set(ref, {
                        code,
                        status: 'waiting',
                        hostUid: user.uid,
                        seed: seed || ((Math.random() * 1e9) | 0),
                        slots: [user.uid, null],
                        players: { [user.uid]: { uid: user.uid, name: user.name, photo: user.photo, anon: user.anon, slot: 0 } },
                        round: 0,
                        createdAt: serverTimestamp(),
                        lastActionAt: serverTimestamp(),
                        expireAt: new Date(Date.now() + 6 * 3600 * 1000),   // TTL: auto-purge the room ~6h after creation
                    });
                    return true;
                });
                if (ok) return code;
            }
            throw new Error('could not allocate a room code');
        }

        async function joinRoom(code) {
            if (!user) throw new Error('not signed in');
            code = String(code || '').trim().toUpperCase();
            const ref = roomRef(code);
            return runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('room not found');
                const d = snap.data();
                if (d.players && d.players[user.uid]) return code;   // rejoin
                const slots = Array.isArray(d.slots) ? d.slots.slice() : [d.hostUid || null, null];
                if (d.status !== 'waiting' || slots[1]) throw new Error('room full');
                slots[1] = user.uid;                                 // write the whole array (no array dot-paths)
                tx.update(ref, {
                    status: 'playing',
                    slots,
                    [`players.${user.uid}`]: { uid: user.uid, name: user.name, photo: user.photo, anon: user.anon, slot: 1 },
                    round: 1,
                    lastActionAt: serverTimestamp(),
                });
                return code;
            });
        }

        async function leaveRoom(code) {
            if (!user) return;
            const ref = roomRef(code);
            try {
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(ref);
                    if (!snap.exists()) return;
                    const d = snap.data();
                    const upd = { [`players.${user.uid}`]: deleteField(), lastActionAt: serverTimestamp() };
                    if (d.hostUid === user.uid) {
                        upd.status = 'finished';                      // host closed the room
                    } else {
                        const slots = Array.isArray(d.slots) ? d.slots.slice() : [d.hostUid || null, null];
                        if (slots[1] === user.uid) slots[1] = null;   // free the guest seat
                        upd.slots = slots;
                        if (d.status !== 'finished') upd.status = 'waiting';
                    }
                    tx.update(ref, upd);
                });
            } catch (e) { /* ignore */ }
        }

        window.ArcadeNet = {
            ok: true,
            sdk: SDK,
            // auth
            onAuth(fn) { authCbs.push(fn); if (user !== undefined) fn(user); },
            currentUser() { return user || null; },
            signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); },
            signInGuest() { return signInAnonymously(auth); },
            signOut() { return signOut(auth); },
            // rooms
            createRoom, joinRoom, leaveRoom,
            watchRoom(code, cb) { return onSnapshot(roomRef(code), (s) => cb(s.exists() ? s.data() : null), (err) => cb(null, err)); },
            updateRoom(code, data) { return updateDoc(roomRef(code), Object.assign({ lastActionAt: serverTimestamp() }, data)); },
            getRoom(code) { return getDoc(roomRef(code)).then((s) => (s.exists() ? s.data() : null)); },
            field: { delete: deleteField, now: serverTimestamp },
        };
        window.dispatchEvent(new CustomEvent('arcade-net-ready'));
    } catch (err) {
        fail(err);
    }
})();
