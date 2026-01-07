// src/lib/firebase.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics';
import { getFirestore, type Firestore, serverTimestamp } from 'firebase/firestore';

// Hardcoded Firebase config object to ensure connectivity.
const firebaseConfig = {
  "projectId": "fsfa-tl5x4",
  "appId": "1:546156811876:web:fd69c51b9ce24ef3b77171",
  "apiKey": "AIzaSyCYsCeRqiGfkdSjKPIQxy_HWW2H3KT2XMg",
  "authDomain": "fsfa-tl5x4.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "546156811876"
};


interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  analytics?: Analytics;
}

let firebaseServices: FirebaseServices | null = null;

function initializeFirebase(): FirebaseServices {
  if (firebaseServices) {
    return firebaseServices;
  }

  if (typeof window === 'undefined') {
    // Return a dummy object for server-side rendering
    const dummyApp = {} as FirebaseApp;
    const dummyAuth = {} as Auth;
    const dummyDb = {} as Firestore;
    return { app: dummyApp, auth: dummyAuth, db: dummyDb };
  }

  // Check for missing configuration values on the client-side
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("🔴 CRITICAL: Firebase configuration is missing. The hardcoded 'firebaseConfig' object in 'src/lib/firebase.ts' might be empty or invalid.");
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
  // This function now robustly handles both SSR and client-side initialization.
  return initializeFirebase();
}

// Also exporting serverTimestamp for convenience
export { serverTimestamp };
