
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
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })).optional().describe('Previous messages for context.'),
});
export type AnswerUserQuestionInput = z.infer<typeof AnswerUserQuestionInputSchema>;

const AnswerUserQuestionOutputSchema = z.object({
  answer: z.string().describe('The AI\'s answer to the user\'s question in Thai.'),
});
export type AnswerUserQuestionOutput = z.infer<typeof AnswerUserQuestionOutputSchema>;

export async function answerUserQuestion(input: AnswerUserQuestionInput): Promise<AnswerUserQuestionOutput> {
  return answerUserQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'answerUserQuestionPrompt',
  input: { schema: AnswerUserQuestionInputSchema },
  output: { schema: AnswerUserQuestionOutputSchema },
  model: 'googleai/gemini-1.5-flash-latest', // Reverted to flash model
  prompt: `
คุณคือ "Momu Ai" ผู้ช่วย AI ที่ให้คำแนะนำด้านอาหารและสุขภาพสำหรับผู้สูงอายุ ตอบคำถามของผู้ใช้เป็นภาษาไทยแบบเป็นกันเอง
คำตอบทั้งหมดต้องอยู่ในรูปแบบ JSON object ดังนี้: {"answer": "ข้อความตอบกลับเป็นภาษาไทย"}

{{#if chatHistory}}
นี่คือประวัติการสนทนาก่อนหน้า โปรดพิจารณาเพื่อความต่อเนื่อง:
{{#each chatHistory}}
{{role}}: {{content}}
{{/each}}
{{/if}}

{{#if foodName}}
ตอนนี้เรากำลังพูดถึงอาหารชื่อ "{{foodName}}"
คำถามล่าสุดจากผู้ใช้: "{{question}}"
โปรดตอบคำถามนี้โดยอ้างอิงถึง "{{foodName}}" และประวัติการสนทนา (ถ้ามี) ถ้าคำถามยังเกี่ยวข้องกับอาหารนี้
หากผู้ใช้เริ่มถามเรื่องทั่วไปที่ไม่เกี่ยวกับ "{{foodName}}" แล้ว ให้ตอบตามบริบทใหม่นั้นได้เลย
{{else}}
คำถามล่าสุดจากผู้ใช้: "{{question}}"
โปรดตอบคำถามนี้โดยอ้างอิงประวัติการสนทนา (ถ้ามี)
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
    const MAX_HISTORY_LENGTH = 6;
    const trimmedChatHistory = input.chatHistory?.slice(-MAX_HISTORY_LENGTH) ?? [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.log('Momu Ai chat timeout triggered after 8 seconds for input:', input.question);
        controller.abort();
    }, 8000); // 8 วินาที timeout

    try {
      const { output } = await prompt({
        ...input,
        chatHistory: trimmedChatHistory,
      });
    
      clearTimeout(timeoutId); 

      if (!output || typeof output.answer !== 'string' || output.answer.trim() === '') {
        console.warn('Momu Ai: Invalid or empty response from model for input:', input.question, 'Received output:', output);
        return {
          answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ",
        };
      }
    
      return output;
    } catch (error: any) {
      clearTimeout(timeoutId); 
      if (error.name === 'AbortError') {
        console.log('Momu Ai chat aborted due to 8-second timeout for input:', input.question);
        return { answer: "Momu Ai ใช้เวลาประมวลผลนานกว่าปกติ โปรดลองอีกครั้งนะคะ" };
      }
      console.error('Error in answerUserQuestionFlow for input:', input.question, error);
      // Log the full error object for more details if it's not an AbortError
      if (error instanceof Error) {
        console.error('Full error details:', error.message, error.stack);
      } else {
        console.error('Full error object:', error);
      }
      return {
        answer: "เกิดข้อผิดพลาดในการประมวลผลคำถาม โปรดลองอีกครั้งในภายหลังนะคะ",
      };
    }
  }
);

