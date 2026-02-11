'use server';
/**
 * AI Food Image Analysis - Optimized for Thai Food Accuracy
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

/* =========================
   INPUT SCHEMA
========================= */

const ScanFoodImageInputSchema = z.object({
  foodImage: z
    .string()
    .min(50)
    .refine(val => val.startsWith('data:'), {
      message: 'Invalid data URI format',
    }),
});

export type ScanFoodImageInput = z.infer<typeof ScanFoodImageInputSchema>;

/* =========================
   OUTPUT SCHEMA
========================= */

const NutritionalInfoObjectSchema = z.object({
  estimatedCalories: z.number().describe('The estimated total calories for the dish (in kilocalories).'),
  visibleIngredients: z.array(z.string()).describe("An array of strings, each identifying a primary visible ingredient, e.g., 'ไข่ดาว 2 ฟอง' (in Thai)."),
  reasoning: z.string().describe("A brief summary explaining the basis for the calorie estimation, e.g., 'ประเมินจากส่วนผสมหลัก...' (in Thai)."),
  confidence: z.number().min(0).max(100).describe('A number from 0-100 representing the confidence level of the food identification.')
});

// This is the final, validated output shape of the flow.
const ScanFoodImageOutputSchema = z.object({
  cuisineType: z.string().describe('The type of cuisine the food belongs to, e.g., "อาหารไทย", "อาหารอิตาเลียน" (in Thai).'),
  foodItem: z.string().describe('The identified food item (in Thai). This may indicate if the food is similar to what was identified.'),
  nutritionalInformation: NutritionalInfoObjectSchema.describe('Structured nutritional information about the food item.'),
});

export type ScanFoodImageOutput = z.infer<typeof ScanFoodImageOutputSchema>;

// This is a more lenient schema for what we expect from the LLM.
// It makes all properties, including nested ones, optional.
const LlmOutputSchema = ScanFoodImageOutputSchema.deepPartial();


/* =========================
   MAIN FUNCTION
========================= */

export async function scanFoodImage(
  input: ScanFoodImageInput
): Promise<ScanFoodImageOutput> {
  return scanFoodImageFlow(input);
}

/* =========================
   PROMPT (Optimized)
========================= */

const prompt = ai.definePrompt({
  name: 'scanFoodImagePrompt',
  input: { schema: ScanFoodImageInputSchema },
  output: { schema: LlmOutputSchema },
  model: 'googleai/gemini-2.5-flash',
  config: {
    temperature: 0.15,
    topP: 0.85,
    maxOutputTokens: 800,
  },
  prompt: `
You are a professional nutritionist and global culinary expert, with a specialization in Thai cuisine, for the MOMU SCAN app.

You MUST respond strictly in valid JSON.
All string values MUST be in Thai.
Do NOT output any text outside the JSON block.

Analyze this food image: {{media url=foodImage}}

========================
INTERNAL MONOLOGUE & ANALYSIS STEPS (MUST FOLLOW)
========================
1.  **Cuisine Identification:** First, I will identify the cuisine's origin (e.g., "อาหารไทย", "อาหารญี่ปุ่น", "อาหารอิตาเลียน"). This context is crucial.
2.  **Dish Identification:** Using the cuisine context, I will meticulously list all visible ingredients (e.g., "หมูสับ", "ใบกระเพรา", "ข้าวสวย"). I will analyze the dish structure (e.g., stir-fried rice vs. rice with topping).
3.  **Hypothesis & Differentiation:**
    *   If cuisine is "อาหารไทย" and I see basil (ใบกระเพรา) and minced meat on plain rice, my primary hypothesis is "ผัดกระเพรา".
    *   If the rice itself is colored and mixed with ingredients, my hypothesis is "ข้าวผัด".
    *   Based on these rules, I will decide on the most accurate dish name.
4.  **Confidence Score:** I will assign a confidence score (0-100) based on how certain I am of the identification.
5.  **Fallback Logic:** If my confidence is below 70, I will use the format "คล้ายกับ [ชื่อเมนู]" for the \`foodItem\`.
6.  **Calorie Estimation:** Based on the identified dish and ingredients, I will estimate the calories. If a dish is identified (even as "คล้ายกับ..."), \`estimatedCalories\` MUST be greater than 0.
7.  **Final Fallback:** If I absolutely cannot identify anything, I will use the specified "unidentifiable" JSON structure.

========================
REQUIRED JSON STRUCTURE
========================
{
  "cuisineType": "string",
  "foodItem": "string",
  "nutritionalInformation": {
    "estimatedCalories": number,
    "visibleIngredients": string[],
    "reasoning": "string",
    "confidence": number // 0-100
  }
}

---
## Example 1: High Confidence (Pad Krapow)
\`\`\`json
{
  "cuisineType": "อาหารไทย",
  "foodItem": "ผัดกระเพราหมูสับไข่ดาว",
  "nutritionalInformation": {
    "estimatedCalories": 650,
    "visibleIngredients": ["หมูสับ", "ไข่ดาว 1 ฟอง", "ข้าวสวย", "พริก", "ใบกระเพรา"],
    "reasoning": "ประเมินจากปริมาณข้าว หมูสับ และไข่ดาว 1 ฟองซึ่งมีน้ำมันจากการทอด",
    "confidence": 95
  }
}
\`\`\`

## Example 2: Similar Food (Unclear Noodle Soup)
\`\`\`json
{
  "cuisineType": "อาหารไทย",
  "foodItem": "คล้ายกับ ก๋วยเตี๋ยวเรือ",
  "nutritionalInformation": {
    "estimatedCalories": 380,
    "visibleIngredients": ["เส้นหมี่", "ลูกชิ้น", "ผักบุ้ง", "น้ำซุปสีเข้ม"],
    "reasoning": "ประเมินจากลักษณะเส้นและน้ำซุปสีเข้ม แต่ภาพไม่ชัดเจนพอที่จะยืนยัน 100%",
    "confidence": 65
  }
}
\`\`\`

## Example 3: Unidentifiable
\`\`\`json
{
  "cuisineType": "ไม่สามารถระบุประเภทได้",
  "foodItem": "ไม่สามารถระบุชนิดอาหารได้",
  "nutritionalInformation": {
    "estimatedCalories": 0,
    "visibleIngredients": [],
    "reasoning": "ไม่สามารถวิเคราะห์ภาพได้เนื่องจากภาพไม่ชัดเจน",
    "confidence": 0
  }
}
\`\`\`
`,
});


/* =========================
   FLOW
========================= */

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

      if (!partialOutput || !partialOutput.nutritionalInformation) {
        console.warn('[scanFoodImageFlow] AI returned null, undefined or incomplete output.');
        // Return a compliant, "unidentifiable" structure
        return {
          cuisineType: 'ไม่สามารถระบุประเภทได้',
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'AI ไม่ได้ส่งข้อมูลกลับมา',
            confidence: 0,
          },
        };
      }
      
      const finalOutput: ScanFoodImageOutput = {
        cuisineType: partialOutput.cuisineType || 'ไม่สามารถระบุประเภทได้',
        foodItem: partialOutput.foodItem || 'ไม่สามารถระบุชนิดอาหารได้',
        nutritionalInformation: {
          estimatedCalories: partialOutput.nutritionalInformation.estimatedCalories ?? 0,
          visibleIngredients: partialOutput.nutritionalInformation.visibleIngredients ?? [],
          reasoning: partialOutput.nutritionalInformation.reasoning ?? 'ไม่มีข้อมูลโภชนาการ',
          confidence: partialOutput.nutritionalInformation.confidence ?? 0,
        },
      };

      console.log('[scanFoodImageFlow] Final Parsed Output:', finalOutput);
      return finalOutput;

    } catch (err: any) {
      console.error('ScanFoodImageFlow Error:', err);
      // Return a compliant, "unidentifiable" structure on error
      return {
          cuisineType: 'ไม่สามารถระบุประเภทได้',
          foodItem: 'ไม่สามารถระบุชนิดอาหารได้',
          nutritionalInformation: {
            estimatedCalories: 0,
            visibleIngredients: [],
            reasoning: 'เกิดข้อผิดพลาดในการประมวลผลจาก AI',
            confidence: 0,
          },
      };
    }
  }
);
