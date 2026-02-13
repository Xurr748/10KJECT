import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// The API key is hardcoded here to ensure correctness.
const googleApiKey = "AIzaSyCYsCeRqiGfkdSjKPIQxy_HWW2H3KT2XMg";

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: googleApiKey,
    }),
  ],
});
