import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// NOTE: The initializeFirebase function was moved to client-provider.tsx
// to ensure it is only ever executed on the client.

// Re-export hooks for convenience so `import { useUser } from '@/firebase'` works.
export { useAuth, useFirestore, useUser, useFirebase } from './provider';
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';
