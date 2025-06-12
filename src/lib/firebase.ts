
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics'; // Import isSupported for robustness
import { getFirestore, type Firestore, serverTimestamp } from 'firebase/firestore'; // Import Firestore and serverTimestamp

const firebaseConfigKeys = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Check for essential Firebase config keys
const essentialKeys: (keyof typeof firebaseConfigKeys)[] = ['apiKey', 'authDomain', 'projectId'];
let missingKeys = false;
for (const key of essentialKeys) {
  if (!firebaseConfigKeys[key]) {
    console.error(`🔴 CRITICAL: Firebase config key "${key}" (mapped from NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}) is missing. Firestore and other Firebase services will likely fail. Please check your .env file and ensure it's correctly loaded.`);
    missingKeys = true;
  }
}

if (missingKeys) {
  console.error("🔴 Firebase initialization might be incomplete due to missing essential configuration. Further errors are expected.");
}

const firebaseConfig = {
  apiKey: firebaseConfigKeys.apiKey,
  authDomain: firebaseConfigKeys.authDomain,
  projectId: firebaseConfigKeys.projectId,
  storageBucket: firebaseConfigKeys.storageBucket,
  messagingSenderId: firebaseConfigKeys.messagingSenderId,
  appId: firebaseConfigKeys.appId,
  measurementId: firebaseConfigKeys.measurementId,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;

if (!missingKeys) { // Proceed with initialization only if essential keys are present
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
        // console.info("Firebase Analytics is not supported in this browser/environment."); // Less critical log
      }
    }).catch(err => {
      console.error("Error during Firebase Analytics support check or initialization:", err);
    });
  }
} else {
  // Provide dummy objects or handle the uninitialized state if necessary,
  // though the app will likely be non-functional regarding Firebase.
  // For now, errors will occur naturally when trying to use uninitialized services.
  console.error("Firebase services (auth, db, analytics) were not initialized due to missing configuration.");
  // @ts-ignore - To satisfy TypeScript, assign a temporary non-functional db, auth
  db = {} as Firestore;
  // @ts-ignore
  auth = {} as Auth;
}


export { app, auth, db, analytics, serverTimestamp };
