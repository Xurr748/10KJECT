
// src/lib/firebase.ts
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics';
import { getFirestore, type Firestore, serverTimestamp } from 'firebase/firestore';

const firebaseConfigKeys = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log('[Firebase Init] Checking raw environment variables for Firebase config:');
console.log(`- NEXT_PUBLIC_FIREBASE_API_KEY: ${process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_APP_ID: ${process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? 'SET' : 'NOT SET'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: ${process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ? 'SET' : 'NOT SET'}`);


const essentialKeys: (keyof typeof firebaseConfigKeys)[] = ['apiKey', 'authDomain', 'projectId'];
let missingKeys = false;
for (const key of essentialKeys) {
  if (!firebaseConfigKeys[key]) {
    console.error(`🔴 CRITICAL: Firebase config key "${key}" (mapped from NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}) is MISSING. Firestore and other Firebase services will likely fail. Please check your .env file and ensure it's correctly loaded and the Next.js server has been RESTARTED since the last .env change.`);
    missingKeys = true;
  }
}

if (missingKeys) {
  console.error("🔴 Firebase initialization might be incomplete due to missing essential configuration. Further errors are expected. Ensure .env file is correctly populated and the server restarted.");
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

console.log('[Firebase Init] Final firebaseConfig object to be passed to initializeApp:', firebaseConfig);


let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;

if (!missingKeys) {
  if (getApps().length === 0) {
    try {
      app = initializeApp(firebaseConfig);
      console.log('[Firebase Init] Firebase app initialized successfully.');
    } catch (error: any) {
      console.error("🔴 CRITICAL: Error during Firebase initializeApp():", error.message, error);
      // @ts-ignore
      app = {} as FirebaseApp; 
      missingKeys = true; 
    }
  } else {
    app = getApps()[0]!;
    console.log('[Firebase Init] Firebase app already initialized, using existing instance.');
  }

  if (app && Object.keys(app).length > 0 && (app as any).name) { 
    try {
      auth = getAuth(app);
      console.log('[Firebase Init] Firebase Auth initialized.');
    } catch (error: any) {
      console.error("🔴 Error initializing Firebase Auth:", error.message, error);
      // @ts-ignore
      auth = undefined;
    }

    try {
      db = getFirestore(app);
      console.log('[Firebase Init] Firebase Firestore initialized.');
    } catch (error: any) {
      console.error("🔴 Error initializing Firebase Firestore:", error.message, error);
      // @ts-ignore
      db = undefined;
    }

    if (typeof window !== 'undefined') {
      isSupported().then(supported => {
        if (supported && firebaseConfig.measurementId) {
          try {
            analytics = getAnalytics(app);
            console.log('[Firebase Init] Firebase Analytics initialized.');
          } catch (error) {
            console.error("Error initializing Firebase Analytics:", error);
          }
        } else if (!supported) {
          // console.info("[Firebase Init] Firebase Analytics is not supported in this browser/environment.");
        }
      }).catch(err => {
        console.error("[Firebase Init] Error during Firebase Analytics support check or initialization:", err);
      });
    }
  } else if (!missingKeys) { 
    console.error("🔴 Firebase app object is not valid after initialization attempt, despite essential keys appearing to be present. This is an unexpected state.");
    missingKeys = true;
  }
}

if (missingKeys) {
  console.error("🔴 Firebase services (auth, db, analytics) were NOT fully initialized due to missing configuration or initialization errors. Please check previous logs. YOU MAY NEED TO RESTART THE NEXT.JS SERVER AFTER CORRECTING .env FILES.");
}

export { app, auth, db, analytics, serverTimestamp };
