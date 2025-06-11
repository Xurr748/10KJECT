'use server';

/**
 * @fileOverview AI agent that analyzes food images and provides nutritional information and safety advice.
 *
 * - analyzeFoodImage - A function that handles the food image analysis process.
 * - AnalyzeFoodImageInput - The input type for the analyzeFoodImage function.
 * - AnalyzeFoodImageOutput - The return type for the analyzeFoodImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeFoodImageInputSchema = z.object({
  foodPhotoDataUri: z
    .string()
    .describe(
      "A photo of a food item, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type AnalyzeFoodImageInput = z.infer<typeof AnalyzeFoodImageInputSchema>;

const AnalyzeFoodImageOutputSchema = z.object({
  identification: z.object({
    foodName: z.string().describe('The identified name of the food item.'),
    confidence: z.number().describe('The confidence level of the identification (0-1).'),
  }),
  nutritionInformation: z.string().describe('Detailed nutritional information about the food item.'),
  safetyAdvice: z.string().describe('Safety advice related to the consumption of the food item.'),
  isIdentified: z.boolean().describe('Whether the food item was successfully identified.'),
});
export type AnalyzeFoodImageOutput = z.infer<typeof AnalyzeFoodImageOutputSchema>;

export async function analyzeFoodImage(input: AnalyzeFoodImageInput): Promise<AnalyzeFoodImageOutput> {
  return analyzeFoodImageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeFoodImagePrompt',
  input: {schema: AnalyzeFoodImageInputSchema},
  output: {schema: AnalyzeFoodImageOutputSchema},
  prompt: `You are an AI assistant specialized in food analysis.

You will identify the food item in the image and provide detailed nutritional information and safety advice.
If you can't determine the food item, respond with empathy and explain that you couldn't identify it. Set isIdentified to false in this case.

Analyze the following food image:

Food Image: {{media url=foodPhotoDataUri}}

Ensure the output is structured according to the AnalyzeFoodImageOutputSchema, especially the isIdentified boolean.
`,
});

const analyzeFoodImageFlow = ai.defineFlow(
  {
    name: 'analyzeFoodImageFlow',
    inputSchema: AnalyzeFoodImageInputSchema,
    outputSchema: AnalyzeFoodImageOutputSchema,
  },
  async input => {
    try {
      const {output} = await prompt(input);
      return output!;
    } catch (error) {
      console.error('Error analyzing food image:', error);
      return {
        identification: {
          foodName: 'Unknown',
          confidence: 0,
        },
        nutritionInformation: 'Could not retrieve nutritional information.',
        safetyAdvice: 'Could not provide safety advice.',
        isIdentified: false,
      };
    }
  }
);
