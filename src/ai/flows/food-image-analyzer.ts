
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
  estimatedCalories: z.number().describe('The estimated total calories for the dish (in kilocalories).'),
  visibleIngredients: z.array(z.string()).describe("An array of strings, each identifying a primary visible ingredient, e.g., 'ไข่ดาว 2 ฟอง' (in Thai)."),
  reasoning: z.string().describe("A brief summary explaining the basis for the calorie estimation, e.g., 'ประเมินจากส่วนผสมหลัก...' (in Thai).")
});

// This is the final, validated output shape of the flow.
const ScanFoodImageOutputSchema = z.object({
  foodItem: z.string().describe('The identified food item (in Thai). This may indicate if the food is similar to what was identified.'),
  nutritionalInformation: NutritionalInfoObjectSchema.describe('Structured nutritional information about the food item.'),
  safetyPrecautions: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('An array of 1 to 5 food safety precautions for seniors (in Thai).'),
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
You are a world-class culinary expert and nutritionist with a specialization in identifying global cuisine, especially Thai food. Your task is to analyze a food image with extreme accuracy and provide a comprehensive, structured JSON response.

You MUST respond strictly in valid JSON format.
Do NOT include any text or explanations outside of the JSON block.
All string values in the JSON MUST be in the Thai language.

Analyze the food image provided: {{media url=foodImage}}

**Your Reasoning Process (Internal Monologue - do not include in JSON output):**
1.  **Detailed Observation:** First, I will meticulously describe the visual elements in the image. What are the shapes, colors, textures? Are there visible ingredients like meats, vegetables, noodles, rice, sauces? I will identify main components and their approximate quantity (e.g., "ไข่ดาว 2 ฟอง").
2.  **Hypothesis Generation & Fallback:** Based on my observations, I will form a primary hypothesis about the identity of the dish.
    *   **If highly confident:** I will state the name of the dish directly (e.g., "ผัดกระเพราหมูสับไข่ดาว").
    *   **If not confident:** I will try to find the closest similar food and use the format "คล้ายกับ [ชื่ออาหารที่คล้ายกัน]" (Similar to [Food Name]). This is much more helpful than giving up.
3.  **Nutritional & Safety Analysis:** Based on my final identification (either confident or "คล้ายกับ"), I will provide a full analysis.
4.  **Final Fallback:** If I absolutely cannot identify any similarity, I will use the specified "unidentifiable" JSON structure.

**CRITICAL RULES FOR JSON OUTPUT:**

1.  **If you can identify the food (even as "คล้ายกับ..."):**
    *   You **MUST** provide a non-zero \`estimatedCalories\` value.
    *   You **MUST** populate all fields: \`foodItem\`, \`nutritionalInformation\` (with all its sub-fields), and \`safetyPrecautions\`.

2.  **If, and ONLY if, you absolutely cannot identify the food:**
    *   You **MUST** use the exact default JSON object specified in Example 3.

## Required JSON Structure:
{
  "foodItem": "string",
  "nutritionalInformation": {
    "estimatedCalories": "number",
    "visibleIngredients": "string[]",
    "reasoning": "string"
  },
  "safetyPrecautions": "string[]" // An array of 1 to 5 items.
}

---

## Example 1: High Confidence Identification (e.g., Clear image of Pad Krapow)
\`\`\`json
{
  "foodItem": "ผัดกระเพราหมูสับไข่ดาว",
  "nutritionalInformation": {
    "estimatedCalories": 650,
    "visibleIngredients": ["หมูสับ", "ไข่ดาว 1 ฟอง", "ข้าวสวย", "พริก", "ใบกระเพรา"],
    "reasoning": "ประเมินจากปริมาณข้าว หมูสับ และไข่ดาว 1 ฟองซึ่งมีน้ำมันจากการทอด"
  },
  "safetyPrecautions": [
    "หากมีโรคประจำตัว ควรลดปริมาณโซเดียมโดยแจ้งร้านว่าขอปรุงรสน้อย",
    "อาจมีรสเผ็ด ควรทานอย่างระมัดระวัง",
    "ไข่ดาวควรทอดให้สุกดีเพื่อหลีกเลี่ยงเชื้อซัลโมเนลลา"
  ]
}
\`\`\`

## Example 2: Similar Food Identification (e.g., An unclear noodle soup)
\`\`\`json
{
  "foodItem": "คล้ายกับ ก๋วยเตี๋ยวเรือ",
  "nutritionalInformation": {
    "estimatedCalories": 380,
    "visibleIngredients": ["เส้นหมี่", "ลูกชิ้น", "ผักบุ้ง", "น้ำซุปสีเข้ม"],
    "reasoning": "ประเมินจากลักษณะเส้นและน้ำซุปสีเข้ม แต่ภาพไม่ชัดเจนพอที่จะยืนยันว่าเป็นก๋วยเตี๋ยวเรือ 100%"
  },
  "safetyPrecautions": [
    "ก๋วยเตี๋ยวเรือมักมีรสจัด ควรปรุงอย่างระมัดระวัง",
    "เลือกร้านที่สะอาดและปรุงสุกใหม่",
    "ระวังการสำลักลูกชิ้น ควรเคี้ยวให้ละเอียด"
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
