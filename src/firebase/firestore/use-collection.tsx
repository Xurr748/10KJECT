"use client";

import { useEffect, useState } from "react";
import { Query, onSnapshot } from "firebase/firestore";

export function useCollection<T>(queryRef: Query<T> | null) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!queryRef) return;

    const unsub = onSnapshot(queryRef, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setData(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [queryRef]);

  return { data, loading };
}
