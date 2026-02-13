// This file contains the Firebase configuration for the app.
// These values are taken directly from the Firebase console.

export const firebaseConfig = {
  apiKey: "AIzaSyCYsCeRqiGfkdSjKPIQxy_HWW2H3KT2XMg",
  authDomain: "fsfa-tl5x4.firebaseapp.com",
  projectId: "fsfa-tl5x4",
  storageBucket: "fsfa-tl5x4.appspot.com",
  messagingSenderId: "546156811876",
  appId: "1:546156811876:web:fd69c51b9ce24ef3b77171"
};

// Validate that the essential Firebase config values are present.
if (
  !firebaseConfig.apiKey ||
  !firebaseConfig.projectId ||
  !firebaseConfig.authDomain
) {
  // This log is helpful for developers to know if their .env is missing.
  console.error(
    'Firebase configuration is missing or incomplete.'
  );
  // In a production environment, you might want to throw an error.
  // throw new Error('Firebase configuration is missing or incomplete.');
}
