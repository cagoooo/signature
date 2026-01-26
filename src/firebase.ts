import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBOw3j4xW-xN-eqGXJ4a38r5duHJ5SjzWk",
    authDomain: "face-2fa85.firebaseapp.com",
    projectId: "face-2fa85",
    storageBucket: "face-2fa85.firebasestorage.app",
    messagingSenderId: "295861662036",
    appId: "1:295861662036:web:091702fa93d8455eb1d8c1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
