
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

const NutritionalInfoObjectSchema = z.object({
  estimatedCalories: z.number().describe('The estimated total calories for the dish (in kilocalories).'),
  visibleIngredients: z.array(z.string()).describe("An array of strings, each identifying a primary visible ingredient used for calorie estimation, e.g., 'ไข่ดาว 2 ฟอง' (in Thai)."),
  reasoning: z.string().describe("A brief summary explaining the basis for the calorie estimation, e.g., 'ประเมินจากส่วนผสมหลัก...' (in Thai).")
});

const ScanFoodImageOutputSchema = z.object({
  foodItem: z.string().describe('The identified food item (in Thai). This may indicate if the food is similar to what was identified.'),
  nutritionalInformation: NutritionalInfoObjectSchema.describe('Structured nutritional information about the food item, focusing on calorie estimation (in Thai).'),
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
  model: 'gemini-pro',
  prompt: `You are a nutrition and food safety expert, especially for seniors. You are also highly knowledgeable about global cuisines, with a special emphasis on Thai cuisine. Your responses MUST be in Thai.

Regarding the food image provided ({{media url=foodImage}}):
Could you please tell me the following, formatted as a JSON object with the keys "foodItem", "nutritionalInformation", and "safetyPrecautions"?

1.  **foodItem**: What is the name of this food item?
    *   Identify the dish as accurately as possible. If it's a specific Thai dish, name it in Thai.
    *   **Fallback**: If you cannot identify the exact food item, try to identify the *closest similar food item*. In this case, the "foodItem" value should clearly indicate it's an approximation, like "คล้ายกับ [ชื่ออาหารที่คล้ายกัน]".
    *   **Final Fallback**: If completely unable to identify, set "foodItem" to "ไม่สามารถระบุชนิดอาหารได้".

2.  **nutritionalInformation**: Analyze the ingredients to estimate the calories. This MUST be a JSON object with "estimatedCalories", "visibleIngredients", and "reasoning" keys.
    *   **Step 1: Identify Visible Ingredients:** First, analyze the image to identify the main visible components and their approximate quantity (e.g., "ไข่ดาว 2 ฟอง", "เนื้อหมูประมาณ 100 กรัม", "ข้าวสวย 1 ถ้วย"). Populate the \`visibleIngredients\` array with these findings (as strings in Thai).
    *   **Step 2: Estimate Calories:** Based on the identified dish ('foodItem') and the \`visibleIngredients\`, calculate an estimated total calorie count for the entire dish. Populate the \`estimatedCalories\` field with this number.
    *   **Step 3: Provide Reasoning:** Briefly explain the basis of your estimation in the \`reasoning\` field. For example: "ประเมินจากส่วนผสมหลักคือไข่ดาวและปริมาณข้าวสวย" (in Thai).
    *   **Fallback**: If you cannot determine the ingredients or calories (e.g., if the food item itself was not identified), you MUST still return the object structure. Set \`estimatedCalories\` to 0, \`visibleIngredients\` to an empty array \`[]\`, and \`reasoning\` to "ไม่สามารถประเมินแคลอรีได้" (Cannot estimate calories).

3.  **safetyPrecautions**: What are three safety precautions for seniors related to this food?
    *   This MUST be an array of exactly three distinct strings. Each string should be a concise safety precaution in Thai.
    *   If no specific advice is applicable, fill each of the three slots with "ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้".

Your entire response, including all text within the JSON structure, MUST be in Thai.
Even if you cannot identify parts of the information, you MUST still return the complete JSON structure with appropriate placeholder messages in Thai for the undetermined fields, ensuring "safetyPrecautions" is always an array of three strings and "nutritionalInformation" follows its required structure.
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
