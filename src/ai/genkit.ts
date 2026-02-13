import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// The API key is hardcoded here to ensure correctness.
const googleApiKey = "AIzaSyATnl_6_0CGoMZ1II_fXmr25eHpBeswBTw";

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: googleApiKey,
    }),
  ],
});
