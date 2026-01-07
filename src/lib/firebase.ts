// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics';
import { getFirestore, type Firestore, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  analytics: Analytics | null;
}

let firebaseServices: FirebaseServices | null = null;

function initializeFirebase(): FirebaseServices {
    if (firebaseServices) {
        return firebaseServices;
    }

    if (!getApps().length) {
        // Log for debugging during initialization
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
             console.error("🔴 CRITICAL: Missing Firebase API Key or Project ID. Check .env file.", {
                apiKey: firebaseConfig.apiKey ? 'OK' : 'MISSING',
                projectId: firebaseConfig.projectId ? 'OK' : 'MISSING',
             });
        }
        initializeApp(firebaseConfig);
    }

    const app = getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    let analytics: Analytics | null = null;

    if (typeof window !== 'undefined') {
        isSupported().then(supported => {
            if (supported) {
                analytics = getAnalytics(app);
                if (firebaseServices) firebaseServices.analytics = analytics;
            }
        });
    }
    
    firebaseServices = { app, auth, db, analytics };
    return firebaseServices;
}

export function getFirebase() {
  // Always initialize, the function itself will handle the singleton instance.
  return initializeFirebase();
}

// Also exporting serverTimestamp for convenience
export { serverTimestamp };
