
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

// Renamed from 'prompt' to 'promptObj' to avoid potential naming conflicts in broader scopes
const promptObj = ai.definePrompt({
  name: 'answerUserQuestionPrompt',
  input: { schema: AnswerUserQuestionInputSchema },
  output: { schema: AnswerUserQuestionOutputSchema },
  model: 'googleai/gemini-1.5-flash-latest',
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
    
    const FLOW_EXECUTION_TIMEOUT_MS = 7500; // 7.5 seconds for user-facing timeout
    const SERVER_DIAGNOSTIC_TIMEOUT_MS = 8000; // 8 seconds for a server-side log

    let serverLogTimeoutId: NodeJS.Timeout | undefined = setTimeout(() => {
      console.warn(`Momu Ai chat flow for input "${input.question}" has been running for over ${SERVER_DIAGNOSTIC_TIMEOUT_MS / 1000} seconds. This is a server-side diagnostic log.`);
    }, SERVER_DIAGNOSTIC_TIMEOUT_MS);

    try {
      const aiCall = promptObj({ // Use the renamed prompt object
        ...input,
        chatHistory: trimmedChatHistory,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FlowTimeout')), FLOW_EXECUTION_TIMEOUT_MS)
      );

      // Race the AI call against our defined timeout
      const result = await Promise.race([aiCall, timeoutPromise]);
      
      // If aiCall completed within FLOW_EXECUTION_TIMEOUT_MS:
      if (serverLogTimeoutId) clearTimeout(serverLogTimeoutId);

      const { output } = result; // `result` is the resolution of `promptObj` call: { response: ..., output: ... }

      if (!output || typeof output.answer !== 'string' || output.answer.trim() === '') {
        console.warn('Momu Ai: Invalid or empty response from model for input:', input.question, 'Received output:', output);
        return {
          answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ",
        };
      }
      return output;

    } catch (error: any) {
      if (serverLogTimeoutId) clearTimeout(serverLogTimeoutId);
      
      if (error.message === 'FlowTimeout') {
        console.log(`Momu Ai chat flow (Promise.race) timed out after ${FLOW_EXECUTION_TIMEOUT_MS / 1000}s for input: "${input.question}"`);
        return { answer: "Momu Ai ใช้เวลาประมวลผลนานกว่าปกติ โปรดลองอีกครั้งนะคะ" };
      }
      
      // Handle other errors
      console.error('Error in answerUserQuestionFlow for input:', input.question, error);
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
