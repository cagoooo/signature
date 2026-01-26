import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
    apiKey: "AIzaSyBOw3j4xW-xN-eqGXJ4a38r5duHJ5SjzWk",
    authDomain: "face-2fa85.firebaseapp.com",
    projectId: "face-2fa85",
    storageBucket: "face-2fa85.firebasestorage.app",
    messagingSenderId: "295861662036",
    appId: "1:295861662036:web:091702fa93d8455eb1d8c1"
};

const app = initializeApp(firebaseConfig);

// Initialize App Check
// TODO: Replace "YOUR_RECAPTCHA_SITE_KEY" with your actual reCAPTCHA v3 site key
// You can get one at https://www.google.com/recaptcha/admin/create
// Make sure to register "localhost" and "cagoooo.github.io" in the reCAPTCHA admin console.
if (typeof window !== 'undefined') {
    // Only initialize in browser environment
    // Use a try-catch block to prevent app crash if key is missing or invalid
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider('6LcN3FYsAAAAABfy3MJ9CjA0bn42xJmjkvEdxg3x'),
            isTokenAutoRefreshEnabled: true
        });
        console.log("App Check initialized");
    } catch (e) {
        console.warn("App Check initialization failed (likely missing site key):", e);
    }
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

