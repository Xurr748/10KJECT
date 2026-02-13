// This file reads the Firebase configuration from environment variables.
// It is the standard and recommended way to handle secrets in a Next.js app.

// Ensure you have a .env file in the root of your project with the required variables.
// See .env.example for the structure.

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
};

// Validate that the essential Firebase config values are present.
if (
  !firebaseConfig.apiKey ||
  !firebaseConfig.projectId ||
  !firebaseConfig.authDomain
) {
  // This log is helpful for developers to know if their .env is missing.
  console.error(
    'Firebase configuration is missing or incomplete. Please check your .env file.'
  );
  // In a production environment, you might want to throw an error.
  // throw new Error('Firebase configuration is missing or incomplete.');
}
