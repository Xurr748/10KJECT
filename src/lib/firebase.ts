
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics'; // Import isSupported for robustness
// import { getFirestore, type Firestore } from 'firebase/firestore'; // Will be needed for chat history

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let auth: Auth;
let analytics: Analytics | null = null; // Initialize as null and type it as potentially null

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

auth = getAuth(app);

// Conditionally initialize analytics only on the client side
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isSupported().then(supported => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (error) {
        console.error("Error initializing Firebase Analytics:", error);
      }
    } else {
      console.info("Firebase Analytics is not supported in this browser/environment.");
    }
  }).catch(err => {
    // This catch is for errors from isSupported() itself or unhandled errors in the .then block
    console.error("Error during Firebase Analytics support check or initialization:", err);
  });
}

export { app, auth, analytics /*, db */ };
