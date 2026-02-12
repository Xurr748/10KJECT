import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const googleApiKey = "AIzaSyCYsCeRqiGfkdSjKPIQxy_HWW2H3KT2XMg";

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
