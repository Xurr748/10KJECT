import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const googleApiKey = "AIzaSyATnl_6_0CGoMZ1II_fXmr25eHpBeswBTw";

if (!googleApiKey) {
  throw new Error('GOOGLE_API_KEY is not defined');
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: googleApiKey,
    }),
  ],
});
