
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics'; // Import isSupported for robustness
import { getFirestore, type Firestore, serverTimestamp } from 'firebase/firestore'; // Import Firestore and serverTimestamp

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
let db: Firestore;
let analytics: Analytics | null = null;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

auth = getAuth(app);
db = getFirestore(app); // Initialize Firestore

if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported && firebaseConfig.measurementId) {
      try {
        analytics = getAnalytics(app);
      } catch (error) {
        console.error("Error initializing Firebase Analytics:", error);
      }
    } else if (!supported) {
      console.info("Firebase Analytics is not supported in this browser/environment.");
    }
  }).catch(err => {
    console.error("Error during Firebase Analytics support check or initialization:", err);
  });
}

export { app, auth, db, analytics, serverTimestamp };

