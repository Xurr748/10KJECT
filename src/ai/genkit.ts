import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// The API key for Google AI is hardcoded here.
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: 'AIzaSyATnl_6_0CGoMZ1lI_fXmr25eHpBeswBTw',
    }),
  ],
});
