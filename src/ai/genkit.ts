import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// The API key for Google AI is sourced from the GOOGLE_API_KEY environment variable.
// This is configured in the .env file at the root of the project.
export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_API_KEY,
    }),
  ],
});
