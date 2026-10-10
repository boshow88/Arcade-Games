/*
 * Firebase web config for online PvP (Rune Duel room matchmaking).
 *
 * These values are PUBLIC by design — they ship to every browser. Security is
 * enforced by Firestore Security Rules + anonymous auth, NOT by hiding this key.
 * It is safe to commit this file.
 *
 * TO FILL IN (one-time, ~5 min — see the chat for step-by-step):
 *   1. https://console.firebase.google.com  → Add project (free "Spark" plan).
 *   2. Build → Firestore Database → Create database → Production mode.
 *   3. Build → Authentication → Sign-in method → enable "Anonymous".
 *   4. Project settings (gear) → Your apps → Web app (</>) → register →
 *      copy the `firebaseConfig` values into the object below.
 *   5. Paste the rules from `firestore.rules` into Firestore → Rules → Publish.
 *
 * Until real values are in, PvP stays disabled and the vs-AI duel is unaffected.
 */
window.FIREBASE_CONFIG = {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME.appspot.com',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
};

// Convenience flag the game checks before offering online play.
window.FIREBASE_READY = window.FIREBASE_CONFIG.apiKey !== 'REPLACE_ME';
