
'use server';
/**
 * @fileOverview A Genkit flow for answering user questions after a food image scan,
 * optimized for speed and clarity, especially for elderly-focused food and health info.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnswerUserQuestionInputSchema = z.object({
  question: z.string().describe('The user\'s question in Thai.'),
  foodName: z.string().optional().describe('The name of the scanned food item (Thai), if available.'),
});
export type AnswerUserQuestionInput = z.infer<typeof AnswerUserQuestionInputSchema>;

const AnswerUserQuestionOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question in Thai.'),
});
export type AnswerUserQuestionOutput = z.infer<typeof AnswerUserQuestionOutputSchema>;

export async function answerUserQuestion(input: AnswerUserQuestionInput): Promise<AnswerUserQuestionOutput> {
  console.log('[Momu AI Flow Entry] answerUserQuestion called with input:', JSON.stringify(input));
  return answerUserQuestionFlow(input);
}

const promptObj = ai.definePrompt({
  name: 'answerUserQuestionPrompt',
  input: { schema: AnswerUserQuestionInputSchema },
  output: { schema: AnswerUserQuestionOutputSchema },
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `
คุณคือ "Momu Ai" ผู้ช่วย AI ที่ให้คำแนะนำด้านอาหารและสุขภาพสำหรับผู้สูงอายุ ตอบคำถามของผู้ใช้เป็นภาษาไทยแบบเป็นกันเอง
คำตอบทั้งหมดต้องอยู่ในรูปแบบ JSON object ดังนี้: {"answer": "ข้อความตอบกลับเป็นภาษาไทย"}

{{#if foodName}}
ตอนนี้เรากำลังพูดถึงอาหารชื่อ "{{foodName}}"
คำถามล่าสุดจากผู้ใช้: "{{question}}"
โปรดตอบคำถามนี้โดยอ้างอิงถึง "{{foodName}}". ถ้าคำถามยังเกี่ยวข้องกับอาหารนี้
หากผู้ใช้เริ่มถามเรื่องทั่วไปที่ไม่เกี่ยวกับ "{{foodName}}" แล้ว ให้ตอบตามบริบทใหม่นั้นได้เลย
{{else}}
คำถามล่าสุดจากผู้ใช้: "{{question}}"
โปรดตอบคำถามนี้
{{/if}}

ให้คำตอบที่กระชับ ชัดเจน เหมาะสำหรับผู้สูงอายุ และอยู่ในรูปแบบ JSON ที่กำหนดเท่านั้น
  `,
});

const answerUserQuestionFlow = ai.defineFlow(
  {
    name: 'answerUserQuestionFlow',
    inputSchema: AnswerUserQuestionInputSchema,
    outputSchema: AnswerUserQuestionOutputSchema,
  },
  async (input) => {
    console.log('[Momu AI Flow Internal] Flow execution started. Input:', JSON.stringify(input));
    
    try {
      console.log('[Momu AI Flow Internal] Attempting to call promptObj...');
      // Relying on Genkit's/model's own timeout mechanisms
      const result = await promptObj({
        question: input.question,
        foodName: input.foodName,
      });
      console.log('[Momu AI Flow Internal] promptObj call successful. Result:', JSON.stringify(result));

      const { output } = result; 

      if (!output || typeof output.answer !== 'string' || output.answer.trim() === '') {
        console.warn('[Momu AI Flow Internal] Invalid or empty response from model. Output:', JSON.stringify(output), 'Input:', JSON.stringify(input));
        return {
          answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ",
        };
      }
      console.log('[Momu AI Flow Internal] Successfully processed valid output. Output:', JSON.stringify(output));
      return output;

    } catch (error: any) {
      console.error('[Momu AI Flow Internal] Error during flow execution. Input:', JSON.stringify(input), 'Error:', error);
      if (error instanceof Error) {
        console.error('[Momu AI Flow Internal] Full error details: Message: ', error.message, 'Stack: ', error.stack);
      } else {
        console.error('[Momu AI Flow Internal] Full error object:', error);
      }
      return {
        answer: "เกิดข้อผิดพลาดในการประมวลผลคำถาม โปรดลองอีกครั้งในภายหลังนะคะ",
      };
    }
  }
);
