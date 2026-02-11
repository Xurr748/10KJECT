"use client";

import { useEffect, useState } from "react";
import {
  Query,
  onSnapshot,
  FirestoreError,
} from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";


export function useCollection<T>(query: Query<T> | null | undefined) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!query) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(query,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setData(docs);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        const contextualError = new FirestorePermissionError({
          operation: 'list', // 'list' for collection queries
          path: query.path,
        });

        setError(contextualError);
        setData([]);
        setLoading(false);

        // Trigger global error propagation
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsub();
  }, [query]);

  return { data, loading, error };
}
