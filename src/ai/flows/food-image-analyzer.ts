
'use server';

/**
 * @fileOverview This file defines a Genkit flow for scanning a food image and providing nutritional information and safety advice.
 *
 * - scanFoodImage - A function that handles the food image scanning process.
 * - ScanFoodImageInput - The input type for the scanFoodImage function.
 * - ScanFoodImageOutput - The return type for the scanFoodImage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ScanFoodImageInputSchema = z.object({
  foodImage: z
    .string()
    .describe(
      "A photo of a food item, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ScanFoodImageInput = z.infer<typeof ScanFoodImageInputSchema>;

const ScanFoodImageOutputSchema = z.object({
  foodItem: z.string().describe('The identified food item (in Thai). This may indicate if the food is similar to what was identified.'),
  nutritionalInformation:
    z.string().describe('Detailed nutritional information about the food item (in Thai). This may be for a similar food item.'),
  safetyPrecautions: z.array(z.string())
    .length(3)
    .describe('Exactly three distinct safety precaution options related to the food item (or a similar item), especially for seniors (in Thai). Each precaution should be a concise piece of advice.'),
});
export type ScanFoodImageOutput = z.infer<typeof ScanFoodImageOutputSchema>;

export async function scanFoodImage(input: ScanFoodImageInput): Promise<ScanFoodImageOutput> {
  return scanFoodImageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'scanFoodImagePrompt',
  input: {schema: ScanFoodImageInputSchema},
  output: {schema: ScanFoodImageOutputSchema},
  prompt: `You are a nutrition and food safety expert, especially for seniors. You are also highly knowledgeable about global cuisines, with a special emphasis on Thai cuisine. Your responses MUST be in Thai.

Regarding the food image provided ({{media url=foodImage}}):
Could you please tell me the following, formatted as a JSON object with the keys "foodItem", "nutritionalInformation", and "safetyPrecautions"?

1.  **foodItem**: What is the name of this food item?
    *   First, try to identify the *exact* food item in the image.
    *   If you recognize it as a specific Thai dish, please name it in Thai.
    *   If you are unsure of the specific Thai dish name but it appears to be Thai food, you can state "อาหารไทย" (Thai food) and briefly describe its main components.
    *   If the food is not Thai, identify it as accurately as possible in Thai.
    *   **Fallback for foodItem**: If you cannot identify the exact food item, try to identify the *closest similar food item* you recognize. In this case, the "foodItem" value should clearly indicate it's an approximation, for example: "คล้ายกับ [ชื่ออาหารที่คล้ายกัน]" or "อาจจะเป็น [ชื่ออาหารที่คล้ายกัน]".
    *   **Final Fallback for foodItem**: If you are completely unable to identify the exact food item OR any similar food item, set "foodItem" to "ไม่สามารถระบุชนิดอาหารได้" (Cannot identify food type).

2.  **nutritionalInformation**: What is its nutritional information?
    *   Provide detailed nutritional information in Thai for the identified food item (whether it's the exact item or a similar item as determined in step 1).
    *   If providing information for a *similar* food item, you may optionally preface the information with a note like "ข้อมูลสำหรับอาหารที่คล้ายกัน:"
    *   **Fallback for nutritionalInformation**: If you cannot determine nutritional information for either the exact or a reasonably similar food item, set "nutritionalInformation" to "ไม่สามารถระบุข้อมูลทางโภชนาการได้" (Cannot determine nutritional information).

3.  **safetyPrecautions**: What are three safety precautions for seniors related to this food (or the identified similar food, if applicable)?
    *   This MUST be an array of exactly three distinct strings. Each string should be a concise safety precaution in Thai.
    *   If there's no specific safety advice or it's not applicable for any of the three precaution slots, "safetyPrecautions" MUST still be an array of three strings, with each string being "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้". If some precautions can be given but not all three, fill the remaining slots with this placeholder message.

Your entire response, including all text within the JSON structure, MUST be in Thai.
Even if you cannot identify parts of the information (exact or similar), you MUST still return the complete JSON structure with appropriate placeholder messages in Thai for the undetermined fields, ensuring "safetyPrecautions" is always an array of three strings.
  `,
});

const scanFoodImageFlow = ai.defineFlow(
  {
    name: 'scanFoodImageFlow',
    inputSchema: ScanFoodImageInputSchema,
    outputSchema: ScanFoodImageOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    if (!output) {
      console.error('ScanFoodImageFlow: AI model did not return a structured output for the image.');
      throw new Error('AI model failed to provide a structured analysis for the image. The scan could not be completed.');
    }
    return output;
  }
);
