'use server';
/**
 * @fileOverview An AI flow for analyzing food images.
 *
 * - scanFoodImage - A function that handles the food image analysis process.
 * - ScanFoodImageInput - The input type for the scanFoodImage function.
 * - ScanFoodImageOutput - The return type for the scanFoodImage function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ScanFoodImageInputSchema = z.object({
  foodImage: z
    .string()
    .min(50)
    .refine(val => val.startsWith('data:'), {
      message: 'Invalid data URI format',
    })
    .describe(
      "A food image as a Base64 data URI. Format: data:<mimetype>;base64,<encoded_data>"
    ),
});

export type ScanFoodImageInput = z.infer<typeof ScanFoodImageInputSchema>;

const NutritionalInfoObjectSchema = z.object({
  estimatedCalories: z.number(),
  visibleIngredients: z.array(z.string()),
  reasoning: z.string(),
});

const ScanFoodImageOutputSchema = z.object({
  foodItem: z.string(),
  nutritionalInformation: NutritionalInfoObjectSchema,
  safetyPrecautions: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('An array of 1 to 5 food safety precautions.'),
});

export type ScanFoodImageOutput = z.infer<typeof ScanFoodImageOutputSchema>;

export async function scanFoodImage(
  input: ScanFoodImageInput
): Promise<ScanFoodImageOutput> {
  return scanFoodImageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'scanFoodImagePrompt',
  input: { schema: ScanFoodImageInputSchema },
  output: { schema: ScanFoodImageOutputSchema },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.3,
    maxOutputTokens: 600,
  },
  prompt: `
You are a professional nutrition and food safety expert specializing in Thai cuisine.
You MUST respond strictly in valid JSON format.
Do NOT include explanations outside JSON.
All responses must be in Thai.

Analyze the food image provided: {{media url=foodImage}}

Return JSON with structure:

{
  "foodItem": string,
  "nutritionalInformation": {
    "estimatedCalories": number,
    "visibleIngredients": string[],
    "reasoning": string
  },
  "safetyPrecautions": string[]
}

Rules:
- Always return all fields
- safetyPrecautions must contain between 1 and 5 items.
- If unsure, estimate reasonably
- If cannot identify food, use fallback values
`,
});

const scanFoodImageFlow = ai.defineFlow(
  {
    name: 'scanFoodImageFlow',
    inputSchema: ScanFoodImageInputSchema,
    outputSchema: ScanFoodImageOutputSchema,
  },
  async input => {
    try {
      console.log('[scanFoodImageFlow] Input:', {
        foodImage: `${input.foodImage.substring(0, 50)}...`,
      });

      const result = await prompt(input);
      console.log('[scanFoodImageFlow] Raw AI Result:', JSON.stringify(result));
      
      const { output } = result;

      if (!output) {
        console.error('[scanFoodImageFlow] AI returned empty or invalid output. Raw response:', result);
        throw new Error('AI returned empty or invalid output');
      }

      console.log('[scanFoodImageFlow] Parsed Output:', output);
      return output;
    } catch (err: any) {
      console.error('ScanFoodImageFlow Error:', err);
      // Re-throw a more user-friendly error message
      throw new Error('ไม่สามารถวิเคราะห์รูปภาพได้ในขณะนี้: ' + (err.message || 'Unknown error'));
    }
  }
);
