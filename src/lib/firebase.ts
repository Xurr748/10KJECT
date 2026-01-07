
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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

// Log to verify that environment variables are loaded
console.log('[Firebase Init] Raw Environment Variables:', {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'SET' : 'NOT SET',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'SET' : 'NOT SET',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET',
});

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  analytics: Analytics | null;
}

let firebaseServices: FirebaseServices | null = null;

function initializeFirebase(): FirebaseServices | null {
  if (firebaseServices) {
    return firebaseServices;
  }

  // Check for essential config keys
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
    console.error("🔴 CRITICAL: Missing essential Firebase configuration (apiKey, authDomain, projectId). Please check your .env file and restart the server.");
    return null;
  }

  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const auth = getAuth(app);
    const db = getFirestore(app);
    let analytics: Analytics | null = null;

    if (typeof window !== 'undefined') {
      isSupported().then(supported => {
        if (supported && firebaseConfig.measurementId) {
          analytics = getAnalytics(app);
          console.log('[Firebase Init] Firebase Analytics initialized.');
        }
      }).catch(err => {
         console.error("[Firebase Init] Error checking Analytics support:", err);
      });
    }

    console.log('[Firebase Init] Firebase services initialized successfully.');
    firebaseServices = { app, auth, db, analytics };
    return firebaseServices;

  } catch (error: any) {
    console.error("🔴 CRITICAL: Error during Firebase initialization:", error.message, error);
    return null;
  }
}

// This is the function that components will import.
// It returns the initialized services or empty objects if initialization failed.
export function getFirebase() {
  const services = initializeFirebase();
  if (!services) {
    // Return a "safe" object with null values to prevent app crashes on destructuring
    // Components should check for the truthiness of these values before using them.
    return { app: null, auth: null, db: null, analytics: null };
  }
  return services;
}

// Also exporting serverTimestamp for convenience
export { serverTimestamp };

    