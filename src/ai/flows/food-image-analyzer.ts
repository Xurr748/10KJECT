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
      'A food image as a Base64 data URI. Format: data:<mimetype>;base64,<encoded_data>'
    ),
});

export type ScanFoodImageInput = z.infer<typeof ScanFoodImageInputSchema>;

const NutritionalInfoObjectSchema = z.object({
  estimatedCalories: z.number(),
  visibleIngredients: z.array(z.string()),
  reasoning: z.string(),
});

// This is the final, validated output shape of the flow.
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

// This is a more lenient schema for what we expect from the LLM.
// It makes all properties, including nested ones, optional.
const LlmOutputSchema = ScanFoodImageOutputSchema.deepPartial();

export async function scanFoodImage(
  input: ScanFoodImageInput
): Promise<ScanFoodImageOutput> {
  return scanFoodImageFlow(input);
}

const prompt = ai.definePrompt({
  name: 'scanFoodImagePrompt',
  input: { schema: ScanFoodImageInputSchema },
  output: { schema: LlmOutputSchema }, // Use the lenient schema for LLM output
  model: 'googleai/gemini-2.5-pro',
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

**Your task is to identify the food and provide a complete nutritional analysis.**

1.  **Identify the main dish:** Determine the name of the food in the image.
2.  **Analyze nutritional content:**
    *   Estimate the total calories. **This is a required field.** Base your estimate on typical ingredients and portion size.
    *   List the main visible ingredients.
    *   Explain the reasoning for your calorie estimate (e.g., "based on portion size and visible oil").
3.  **Provide safety advice:** List 1-5 relevant safety precautions or health tips.

## JSON Structure
{
  "foodItem": "string",
  "nutritionalInformation": {
    "estimatedCalories": "number",
    "visibleIngredients": "string[]",
    "reasoning": "string"
  },
  "safetyPrecautions": "string[]"
}

## Important Rules & Examples

1.  **IF YOU CAN IDENTIFY THE FOOD**, you **MUST** provide a non-zero \`estimatedCalories\` value and populate all other fields. Provide your best professional estimate.
    *Example for "ผัดไทยกุ้งสด" (Pad Thai with shrimp):*
    \`\`\`json
    {
      "foodItem": "ผัดไทยกุ้งสด",
      "nutritionalInformation": {
        "estimatedCalories": 450,
        "visibleIngredients": ["เส้นจันท์", "กุ้ง", "ไข่", "ถั่วงอก", "ใบกุยช่าย", "เต้าหู้"],
        "reasoning": "ประเมินจากปริมาณเส้น น้ำมันที่ใช้ผัด และจำนวนกุ้ง"
      },
      "safetyPrecautions": [
        "ผู้ที่แพ้กุ้งควรหลีกเลี่ยง",
        "ควรทานคู่กับผักสดเพื่อเพิ่มใยอาหาร",
        "ระวังถั่วลิสงป่นสำหรับผู้ที่แพ้ถั่ว"
      ]
    }
    \`\`\`

2.  **IF YOU CANNOT IDENTIFY THE FOOD**, you **MUST** use these exact default values.
    \`\`\`json
    {
      "foodItem": "ไม่สามารถระบุชนิดอาหารได้",
      "nutritionalInformation": {
        "estimatedCalories": 0,
        "visibleIngredients": [],
        "reasoning": "ไม่สามารถวิเคราะห์ภาพได้"
      },
      "safetyPrecautions": [
        "โปรดถ่ายภาพให้ชัดเจนขึ้นและลองอีกครั้ง"
      ]
    }
    \`\`\`
`,
});

const scanFoodImageFlow = ai.defineFlow(
  {
    name: 'scanFoodImageFlow',
    inputSchema: ScanFoodImageInputSchema,
    outputSchema: ScanFoodImageOutputSchema, // The flow itself still promises the strict, complete schema
  },
  async input => {
    try {
      console.log('[scanFoodImageFlow] Input:', {
        foodImage: `${input.foodImage.substring(0, 50)}...`,
      });

      const result = await prompt(input);
      const partialOutput = result.output;

      console.log('[scanFoodImageFlow] Raw AI Output:', JSON.stringify(partialOutput));

      if (!partialOutput) {
        console.warn('[scanFoodImageFlow] AI returned null or undefined output.');
        // On failure, return a valid object that indicates failure.
        return {
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'AI ไม่ได้ส่งข้อมูลกลับมา',
          },
          safetyPrecautions: ['โปรดลองอีกครั้ง หรือใช้รูปภาพอื่น'],
        };
      }

      // Build a complete, validated output object with fallbacks to ensure schema is always met.
      const finalOutput: ScanFoodImageOutput = {
        foodItem: partialOutput.foodItem || 'ไม่สามารถระบุชนิดอาหารได้',
        nutritionalInformation: {
          estimatedCalories: partialOutput.nutritionalInformation?.estimatedCalories ?? 0,
          visibleIngredients: partialOutput.nutritionalInformation?.visibleIngredients ?? [],
          reasoning: partialOutput.nutritionalInformation?.reasoning ?? 'ไม่มีข้อมูลโภชนาการ',
        },
        safetyPrecautions:
          partialOutput.safetyPrecautions &&
          partialOutput.safetyPrecautions.length > 0
            ? partialOutput.safetyPrecautions.slice(0, 5) // Ensure max 5 items
            : ['ไม่มีคำแนะนำด้านความปลอดภัยเฉพาะสำหรับรายการนี้'],
      };


      console.log('[scanFoodImageFlow] Final Parsed Output:', finalOutput);
      return finalOutput; // This is now guaranteed to match the strict outputSchema
    } catch (err: any) {
      console.error('ScanFoodImageFlow Error:', err);
      // On any exception (like schema validation), return a valid object indicating failure.
      return {
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'เกิดข้อผิดพลาดในการประมวลผลจาก AI',
          },
          safetyPrecautions: ['โปรดลองอีกครั้ง หรือใช้รูปภาพอื่น'],
      };
    }
  }
);
