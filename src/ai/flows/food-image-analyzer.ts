'use server';
/**
 * @fileOverview An AI flow for analyzing food images, optimized for Thai food.
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
  reasoning: z.string().describe("A brief summary explaining the basis for the calorie estimation, e.g., 'ประเมินจากส่วนผสมหลัก...' (in Thai)."),
  confidence: z.number().min(0).max(100).describe('A number from 0-100 representing the confidence level of the food identification.')
});

// This is the final, validated output shape of the flow.
const ScanFoodImageOutputSchema = z.object({
  foodItem: z.string().describe('The identified food item (in Thai). This may indicate if the food is similar to what was identified.'),
  nutritionalInformation: NutritionalInfoObjectSchema.describe('Structured nutritional information about the food item.'),
  safetyPrecautions: z
    .array(z.string())
    .length(3, { message: "Must provide exactly 3 safety precautions." })
    .describe('An array of exactly 3 food safety precautions for seniors (in Thai).'),
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
  output: { schema: LlmOutputSchema },
  model: 'googleai/gemini-1.5-pro',
  config: {
    temperature: 0.15,
    topP: 0.85,
    maxOutputTokens: 800,
  },
  prompt: `
You are a professional nutritionist and Thai culinary expert for the MOMU SCAN app. Your goal is to provide accurate, structured nutritional information.

You MUST respond strictly in valid JSON.
All string values MUST be in Thai.
Do NOT output any text outside the JSON block.

Analyze this food image: {{media url=foodImage}}

========================
INTERNAL MONOLOGUE & ANALYSIS STEPS (MUST FOLLOW)
========================
1.  **Detailed Observation:** I will meticulously list all visible ingredients (e.g., "หมูสับ", "ใบกระเพรา", "ข้าวสวย").
2.  **Dish Structure Analysis:** Is the rice stir-fried and mixed with ingredients (like ข้าวผัด), or is it plain white rice served with a topping? This is a key differentiator.
3.  **Hypothesis & Differentiation:**
    *   If I see basil (ใบกระเพรา) and minced meat on plain rice, my primary hypothesis is "ผัดกระเพรา".
    *   If the rice itself is colored and mixed with ingredients, my hypothesis is "ข้าวผัด".
    *   If there's a fried egg on plain white rice, it's NOT fried rice.
    *   Based on these rules, I will decide on the most accurate dish name.
4.  **Confidence Score:** I will assign a confidence score (0-100) based on how certain I am of the identification.
5.  **Fallback Logic:** If my confidence is below 70, I will use the format "คล้ายกับ [ชื่อเมนู]" for the \`foodItem\`.
6.  **Calorie Estimation:** Based on the identified dish and ingredients, I will estimate the calories. If a dish is identified (even as "คล้ายกับ..."), \`estimatedCalories\` MUST be greater than 0.
7.  **Final Fallback:** If I absolutely cannot identify any similarity, I will use the specified "unidentifiable" JSON structure.

========================
REQUIRED JSON STRUCTURE
========================
{
  "foodItem": "string",
  "nutritionalInformation": {
    "estimatedCalories": number,
    "visibleIngredients": string[],
    "reasoning": "string",
    "confidence": number // 0-100
  },
  "safetyPrecautions": string[] // An array of EXACTLY 3 items.
}

---
## Example 1: High Confidence (Pad Krapow)
\`\`\`json
{
  "foodItem": "ผัดกระเพราหมูสับไข่ดาว",
  "nutritionalInformation": {
    "estimatedCalories": 650,
    "visibleIngredients": ["หมูสับ", "ไข่ดาว 1 ฟอง", "ข้าวสวย", "พริก", "ใบกระเพรา"],
    "reasoning": "ประเมินจากปริมาณข้าว หมูสับ และไข่ดาว 1 ฟองซึ่งมีน้ำมันจากการทอด",
    "confidence": 95
  },
  "safetyPrecautions": [
    "หากมีโรคประจำตัว ควรลดปริมาณโซเดียมโดยแจ้งร้านว่าขอปรุงรสน้อย",
    "อาจมีรสเผ็ด ควรทานอย่างระมัดระวัง",
    "ไข่ดาวควรทอดให้สุกดีเพื่อหลีกเลี่ยงเชื้อซัลโมเนลลา"
  ]
}
\`\`\`

## Example 2: Similar Food (Unclear Noodle Soup)
\`\`\`json
{
  "foodItem": "คล้ายกับ ก๋วยเตี๋ยวเรือ",
  "nutritionalInformation": {
    "estimatedCalories": 380,
    "visibleIngredients": ["เส้นหมี่", "ลูกชิ้น", "ผักบุ้ง", "น้ำซุปสีเข้ม"],
    "reasoning": "ประเมินจากลักษณะเส้นและน้ำซุปสีเข้ม แต่ภาพไม่ชัดเจนพอที่จะยืนยัน 100%",
    "confidence": 65
  },
  "safetyPrecautions": [
    "ก๋วยเตี๋ยวเรือมักมีรสจัด ควรปรุงอย่างระมัดระวัง",
    "เลือกร้านที่สะอาดและปรุงสุกใหม่",
    "ระวังการสำลักลูกชิ้น ควรเคี้ยวให้ละเอียด"
  ]
}
\`\`\`

## Example 3: Unidentifiable
\`\`\`json
{
  "foodItem": "ไม่สามารถระบุชนิดอาหารได้",
  "nutritionalInformation": {
    "estimatedCalories": 0,
    "visibleIngredients": [],
    "reasoning": "ไม่สามารถวิเคราะห์ภาพได้เนื่องจากภาพไม่ชัดเจน",
    "confidence": 0
  },
  "safetyPrecautions": [
    "โปรดถ่ายภาพให้ชัดเจนขึ้นและลองอีกครั้ง",
    "ตรวจสอบให้แน่ใจว่าภาพมีแสงสว่างเพียงพอ",
    "รูปภาพอาจไม่ใช่รูปอาหาร"
  ]
}
\`\`\`
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
      const partialOutput = result.output;

      console.log('[scanFoodImageFlow] Raw AI Output:', JSON.stringify(partialOutput));

      if (!partialOutput) {
        console.warn('[scanFoodImageFlow] AI returned null or undefined output.');
        return {
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'AI ไม่ได้ส่งข้อมูลกลับมา',
            confidence: 0,
          },
          safetyPrecautions: ['โปรดลองอีกครั้ง หรือใช้รูปภาพอื่น', 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'รูปภาพอาจไม่ชัดเจน'],
        };
      }

      let precautions = partialOutput.safetyPrecautions?.filter(p => typeof p === 'string' && p.length > 0) ?? [];
      if (precautions.length > 3) {
        precautions = precautions.slice(0, 3);
      }
      while (precautions.length < 3) {
        precautions.push('ไม่มีคำแนะนำด้านความปลอดภัยเพิ่มเติม');
      }

      const finalOutput: ScanFoodImageOutput = {
        foodItem: partialOutput.foodItem || 'ไม่สามารถระบุชนิดอาหารได้',
        nutritionalInformation: {
          estimatedCalories: partialOutput.nutritionalInformation?.estimatedCalories ?? 0,
          visibleIngredients: partialOutput.nutritionalInformation?.visibleIngredients ?? [],
          reasoning: partialOutput.nutritionalInformation?.reasoning ?? 'ไม่มีข้อมูลโภชนาการ',
          confidence: partialOutput.nutritionalInformation?.confidence ?? 0,
        },
        safetyPrecautions: precautions,
      };

      console.log('[scanFoodImageFlow] Final Parsed Output:', finalOutput);
      return finalOutput;
    } catch (err: any) {
      console.error('ScanFoodImageFlow Error:', err);
      return {
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'เกิดข้อผิดพลาดในการประมวลผลจาก AI',
            confidence: 0,
          },
          safetyPrecautions: ['โปรดลองอีกครั้ง หรือใช้รูปภาพอื่น', 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', 'รูปภาพอาจไม่ชัดเจน'],
      };
    }
  }
);
