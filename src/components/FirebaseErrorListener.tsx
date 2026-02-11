"use client";

import { useEffect } from "react";

interface Props {
  error: Error | null;
}

export default function FirebaseErrorListener({ error }: Props) {
  useEffect(() => {
    if (error) {
      console.error(error);
      alert(error.message);
    }
  }, [error]);

  return null;
}
