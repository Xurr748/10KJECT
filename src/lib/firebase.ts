
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
  analytics?: Analytics;
}

let firebaseServices: FirebaseServices | null = null;

function initializeFirebase(): FirebaseServices {
  if (typeof window === 'undefined') {
    // Return a dummy object for server-side rendering
    // This prevents errors during SSR but functionality will be client-side.
    if (firebaseServices) return firebaseServices;
    const dummyApp = {} as FirebaseApp;
    const dummyAuth = {} as Auth;
    const dummyDb = {} as Firestore;
    firebaseServices = { app: dummyApp, auth: dummyAuth, db: dummyDb };
    return firebaseServices;
  }
  
  if (firebaseServices) {
      return firebaseServices;
  }

  // Check for missing configuration values on the client-side
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("🔴 CRITICAL: Missing Firebase API Key or Project ID. Check your .env.local file.", {
       apiKey: firebaseConfig.apiKey ? 'OK' : 'MISSING',
       projectId: firebaseConfig.projectId ? 'OK' : 'MISSING',
    });
  }

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  firebaseServices = { app, auth, db };

  isSupported().then(supported => {
      if (supported && firebaseServices) {
          firebaseServices.analytics = getAnalytics(app);
      }
  });
  
  return firebaseServices;
}

export function getFirebase(): FirebaseServices {
  // The function now handles both SSR and client-side initialization.
  return initializeFirebase();
}

// Also exporting serverTimestamp for convenience
export { serverTimestamp };
