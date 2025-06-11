
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
  model: 'googleai/gemini-1.5-flash-latest', // Explicitly set fast model
  prompt: `
คุณคือ "Momu Ai" ผู้ช่วย AI ที่ให้คำแนะนำด้านอาหารและสุขภาพสำหรับผู้สูงอายุ ตอบคำถามของผู้ใช้เป็นภาษาไทยแบบเป็นกันเอง และส่งกลับในรูปแบบ JSON: {"answer": "ข้อความ"}

{{#if chatHistory}}
ประวัติการสนทนา:
{{#each chatHistory}}
{{role}}: {{content}}
{{/each}}
{{/if}}

{{#if foodName}}
หัวข้อหลักคือ "{{foodName}}"
คำถาม: "{{question}}"
โปรดตอบโดยอ้างอิง "{{foodName}}" ถ้าเกี่ยวข้อง
{{else}}
คำถาม: "{{question}}"
{{/if}}

ให้คำตอบที่กระชับ ชัดเจน เหมาะสำหรับผู้สูงอายุ
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
    // Timeout for the flow operation, not directly for the model call cancellation
    const timeoutId = setTimeout(() => {
        console.log('Momu Ai chat timeout triggered after 8 seconds for input:', input.question);
        controller.abort();
    }, 8000); // 8 วินาที timeout

    try {
      const { output } = await prompt({
        ...input,
        chatHistory: trimmedChatHistory,
      });
    
      clearTimeout(timeoutId); // Clear timeout if prompt resolves in time

      if (!output || typeof output.answer !== 'string' || output.answer.trim() === '') {
        console.warn('Momu Ai: Invalid or empty response from model for input:', input.question, 'Received output:', output);
        return {
          answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ",
        };
      }
    
      return output;
    } catch (error: any) {
      clearTimeout(timeoutId); // Ensure timeout is cleared on error
      if (error.name === 'AbortError') {
        console.log('Momu Ai chat aborted due to 8-second timeout for input:', input.question);
        return { answer: "Momu Ai ใช้เวลาประมวลผลนานกว่าปกติ โปรดลองอีกครั้งนะคะ" };
      }
      console.error('Error in answerUserQuestionFlow for input:', input.question, error);
      return {
        answer: "เกิดข้อผิดพลาดในการประมวลผลคำถาม โปรดลองอีกครั้งในภายหลังนะคะ",
      };
    }
  }
);

