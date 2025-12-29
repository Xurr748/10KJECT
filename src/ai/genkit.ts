
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const googleApiKey = process.env.GOOGLE_API_KEY;

if (!googleApiKey) {
  // This will log on the server when genkit.ts is imported.
  console.error("🔴 CRITICAL: GOOGLE_API_KEY is not defined in the environment variables for Genkit.");
  console.error("👉 Please ensure GOOGLE_API_KEY is correctly set in your .env file and the server has been restarted since the last .env change.");
  // Genkit's googleAI plugin will also throw an error if the key is missing,
  // but this log provides an earlier, more direct warning.
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: googleApiKey, // Use the checked variable
    }),
  ],
  model: 'googleai/gemini-pro-vision',
});

