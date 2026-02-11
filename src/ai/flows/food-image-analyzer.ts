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
You are a world-class culinary expert and nutritionist with a specialization in identifying global cuisine, especially Thai food. Your task is to analyze a food image with extreme accuracy and provide a comprehensive, structured JSON response. You must think step-by-step.

You MUST respond strictly in valid JSON format.
Do NOT include any text or explanations outside of the JSON block.
All string values in the JSON MUST be in the Thai language.

Analyze the food image provided: {{media url=foodImage}}

**Your Reasoning Process (Internal Monologue - do not include in JSON output):**
1.  **Detailed Observation:** First, I will meticulously describe the visual elements in the image. What are the shapes, colors, textures? Are there visible ingredients like meats, vegetables, noodles, rice, sauces?
2.  **Hypothesis Generation:** Based on my observations, I will form a primary hypothesis about the identity of the dish. I will also consider 2-3 alternative possibilities.
3.  **Confidence Assessment & Final Identification:** I will assess my confidence.
    *   If I am highly confident, I will state the name of the dish directly.
    *   If I am not 100% confident but have a strong hypothesis, I will identify the food using the format "น่าจะคือ [ชื่ออาหาร]" (This is likely [Food Name]). This provides a useful best-guess instead of giving up.
4.  **Nutritional & Safety Analysis:** Based on my final identification, I will provide a full analysis.

**CRITICAL RULES FOR JSON OUTPUT:**

1.  **If you can identify the food (even as a best guess "น่าจะคือ..."):**
    *   You **MUST** provide a non-zero \`estimatedCalories\` value. Do not return 0 or null for this field if the food is identified.
    *   You **MUST** populate all fields: \`foodItem\`, \`nutritionalInformation\` (with all its sub-fields), and \`safetyPrecautions\`.

2.  **If, and ONLY if, you absolutely cannot identify the food from the image:**
    *   You **MUST** use the exact default JSON object specified below. Do not deviate.

## Required JSON Structure:
{
  "foodItem": "string",
  "nutritionalInformation": {
    "estimatedCalories": "number",
    "visibleIngredients": "string[]",
    "reasoning": "string"
  },
  "safetyPrecautions": "string[]"
}

---

## Example 1: High Confidence Identification (e.g., Clear image of Pad Thai)
\`\`\`json
{
  "foodItem": "ผัดไทยกุ้งสด",
  "nutritionalInformation": {
    "estimatedCalories": 450,
    "visibleIngredients": ["เส้นจันท์", "กุ้ง", "ไข่", "ถั่วงอก", "ใบกุยช่าย", "เต้าหู้"],
    "reasoning": "ประเมินจากปริมาณเส้น น้ำมันที่ใช้ผัด และจำนวนกุ้งที่มองเห็นได้ชัดเจน"
  },
  "safetyPrecautions": [
    "ผู้ที่แพ้กุ้งควรหลีกเลี่ยง",
    "ควรทานคู่กับผักสดเพื่อเพิ่มใยอาหาร",
    "ระวังถั่วลิสงป่นสำหรับผู้ที่แพ้ถั่ว"
  ]
}
\`\`\`

## Example 2: Best-Guess Identification (e.g., Unclear noodle soup)
\`\`\`json
{
  "foodItem": "น่าจะคือ ก๋วยเตี๋ยวเรือ",
  "nutritionalInformation": {
    "estimatedCalories": 380,
    "visibleIngredients": ["เส้นหมี่", "ลูกชิ้น", "ผักบุ้ง", "น้ำซุปสีเข้ม"],
    "reasoning": "ประเมินจากลักษณะเส้นและน้ำซุปสีเข้ม แต่ภาพไม่ชัดเจนพอที่จะยืนยัน 100%"
  },
  "safetyPrecautions": [
    "ก๋วยเตี๋ยวเรือมักมีรสจัด ควรปรุงอย่างระมัดระวัง",
    "เลือกร้านที่สะอาดและปรุงสุกใหม่"
  ]
}
\`\`\`

## Example 3: Unidentifiable Image (e.g., Blurry, non-food)
\`\`\`json
{
  "foodItem": "ไม่สามารถระบุชนิดอาหารได้",
  "nutritionalInformation": {
    "estimatedCalories": 0,
    "visibleIngredients": [],
    "reasoning": "ไม่สามารถวิเคราะห์ภาพได้เนื่องจากภาพไม่ชัดเจน"
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
