
'use server';
/**
 * @fileOverview A Genkit flow for answering user questions after a food image scan,
 * focusing on the scanned food item if provided.
 *
 * - answerUserQuestion - A function that handles the Q&A process.
 * - AnswerUserQuestionInput - The input type for the answerUserQuestion function.
 * - AnswerUserQuestionOutput - The return type for the answerUserQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnswerUserQuestionInputSchema = z.object({
  question: z.string().describe('The user\'s question in Thai.'),
  foodName: z.string().optional().describe('The name of the food item that was scanned (in Thai), if available. This provides context to the AI.'),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })).optional().describe('Previous messages in the conversation for context.'),
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
  input: {schema: AnswerUserQuestionInputSchema},
  output: {schema: AnswerUserQuestionOutputSchema},
  model: 'googleai/gemini-1.5-flash-latest', // Explicitly using Gemini
  prompt: `คุณคือ "Momu Ai" ผู้ช่วย AI ที่เป็นมิตรและมีความรู้กว้างขวางเกี่ยวกับอาหาร โภชนาการ และสุขภาพ โดยเฉพาะอย่างยิ่งสำหรับผู้สูงอายุ คุณจะต้องตอบคำถามของผู้ใช้เป็นภาษาไทยเสมอ

{{#if foodName}}
ตอนนี้เรากำลังพูดถึง "{{foodName}}" เป็นหลัก กรุณาให้ข้อมูลที่เกี่ยวข้องกับ "{{foodName}}" ให้ละเอียดที่สุดเท่าที่จะทำได้เมื่อตอบคำถามของผู้ใช้ อาจรวมถึง:
*   ข้อมูลทางโภชนาการที่สำคัญ (เช่น แคลอรี่ โปรตีน วิตามิน แร่ธาตุ)
*   ประโยชน์ต่อสุขภาพ
*   ข้อควรระวังในการบริโภค (โดยเฉพาะสำหรับผู้สูงอายุ)
*   เคล็ดลับในการเลือกซื้อ การเก็บรักษา หรือการเตรียม
*   ไอเดียเมนูง่ายๆ ที่มี "{{foodName}}" เป็นส่วนประกอบ
*   ข้อเท็จจริงที่น่าสนใจ
*   หากผู้ใช้ถามคำถามที่ไม่เกี่ยวกับ "{{foodName}}" โดยตรง ให้พยายามเชื่อมโยงกลับมาอย่างสุภาพ หรือตอบคำถามนั้นๆ แล้วเสนอที่จะให้ข้อมูลเพิ่มเติมเกี่ยวกับ "{{foodName}}"

ตัวอย่างการสนทนาที่ผ่านมา (ถ้ามี):
{{#if chatHistory}}
{{#each chatHistory}}
{{#if (eq role "user")}}User: {{content}}{{/if}}
{{#if (eq role "model")}}Momu Ai: {{content}}{{/if}}
{{/each}}
{{/if}}

คำถามล่าสุดจากผู้ใช้: "{{question}}"
{{else}}
กรุณาตอบคำถามของผู้ใช้เกี่ยวกับอาหาร โภชนาการ หรือสุขภาพทั่วไป คำแนะนำของคุณควรเป็นประโยชน์และเข้าใจง่ายสำหรับทุกคน โดยเฉพาะผู้สูงอายุ ตอบเป็นภาษาไทยเสมอ

ตัวอย่างการสนทนาที่ผ่านมา (ถ้ามี):
{{#if chatHistory}}
{{#each chatHistory}}
{{#if (eq role "user")}}User: {{content}}{{/if}}
{{#if (eq role "model")}}Momu Ai: {{content}}{{/if}}
{{/each}}
{{/if}}

คำถามล่าสุดจากผู้ใช้: "{{question}}"
{{/if}}

คำตอบของคุณ (Momu Ai):
`,
});

const answerUserQuestionFlow = ai.defineFlow(
  {
    name: 'answerUserQuestionFlow',
    inputSchema: AnswerUserQuestionInputSchema,
    outputSchema: AnswerUserQuestionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      console.error('answerUserQuestionFlow: AI model did not return a structured output.');
      return { answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ ลองใหม่อีกครั้งนะคะ" };
    }
    return output;
  }
);
