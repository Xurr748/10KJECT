
'use server';
/**
 * @fileOverview A Genkit flow for answering user questions after a food image scan,
 * focusing on the scanned food item if provided, and utilizing chat history for context.
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
  })).optional().describe('Previous messages in the conversation for context. Use this to understand the flow and provide coherent answers.'),
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
  model: 'googleai/gemini-1.5-flash-latest',
  prompt: `คุณคือ "Momu Ai" ผู้ช่วย AI ที่เป็นมิตรและมีความรู้กว้างขวางเกี่ยวกับอาหาร โภชนาการ และสุขภาพ โดยเฉพาะอย่างยิ่งสำหรับผู้สูงอายุ คุณจะต้องตอบคำถามของผู้ใช้เป็นภาษาไทยเสมอ.
คำตอบทั้งหมดของคุณต้องอยู่ในรูปแบบ JSON object ที่มี key เดียวคือ "answer" และค่าของ key นี้คือข้อความตอบกลับของคุณเป็นภาษาไทย ตัวอย่างเช่น: {"answer": "นี่คือคำตอบของคุณ"}

{{#if chatHistory}}
นี่คือประวัติการสนทนาที่ผ่านมา โปรดใช้ข้อมูลนี้เพื่อทำความเข้าใจบริบทของคำถามปัจจุบัน และเพื่อให้คำตอบของคุณสอดคล้อง:
{{#each chatHistory}}
{{#if (eq role "user")}}User: {{content}}{{/if}}
{{#if (eq role "model")}}Momu Ai: {{content}}{{/if}}
{{/each}}
{{else}}
นี่เป็นการเริ่มต้นการสนทนาใหม่ หรือไม่มีประวัติการสนทนาก่อนหน้า.
{{/if}}

{{#if foodName}}
หัวข้อหลักที่กำลังสนทนา (ถ้ายังเกี่ยวข้องจากประวัติการสนทนา) คือ: "{{foodName}}".
เมื่อพิจารณาประวัติการสนทนา (ถ้ามี) และ "{{foodName}}", กรุณาตอบคำถามล่าสุดของผู้ใช้: "{{question}}".
คำตอบของคุณควร:
1.  เกี่ยวข้องกับ "{{foodName}}" หากคำถามของผู้ใช้ยังคงวนเวียนอยู่กับอาหารนี้ หรือสามารถเชื่อมโยงได้อย่างเป็นธรรมชาติจากประวัติการสนทนา.
2.  สอดคล้องกับประวัติการสนทนาที่ผ่านมา หากผู้ใช้กำลังถามคำถามต่อเนื่อง หรืออ้างอิงถึงข้อมูลที่เคยคุยกันเกี่ยวกับ "{{foodName}}" หรือหัวข้ออื่น.
3.  ให้ข้อมูลที่เป็นประโยชน์และครอบคลุมเกี่ยวกับ "{{foodName}}" (หากเหมาะสมและเกี่ยวข้องกับคำถามปัจจุบัน):
    *   ข้อมูลทางโภชนาการที่สำคัญ (เช่น แคลอรี่ โปรตีน วิตามิน แร่ธาตุ)
    *   ประโยชน์ต่อสุขภาพ
    *   ข้อควรระวังในการบริโภค (โดยเฉพาะสำหรับผู้สูงอายุ)
    *   เคล็ดลับในการเลือกซื้อ การเก็บรักษา หรือการเตรียม
    *   ไอเดียเมนูง่ายๆ ที่มี "{{foodName}}" เป็นส่วนประกอบ
    *   ข้อเท็จจริงที่น่าสนใจ
4.  หากผู้ใช้ถามคำถามที่ไม่เกี่ยวกับ "{{foodName}}" โดยตรง และดูเหมือนจะเปลี่ยนหัวข้อไปจากประวัติการสนทนา, ให้ตอบคำถามนั้นๆ โดยไม่จำเป็นต้องพยายามเชื่อมโยงกลับมาที่ "{{foodName}}" ทุกครั้ง. ใช้วิจารณญาณตามความเหมาะสมของบทสนทนา.

{{else}}
เมื่อพิจารณาประวัติการสนทนา (ถ้ามี), กรุณาตอบคำถามล่าสุดของผู้ใช้: "{{question}}".
คำแนะนำของคุณควรเป็นประโยชน์และเข้าใจง่ายสำหรับทุกคน โดยเฉพาะผู้สูงอายุ. หากมีประวัติการสนทนา, พยายามให้คำตอบของคุณสอดคล้องและต่อเนื่องจากสิ่งที่คุยกันไปแล้ว.
{{/if}}
`,
});

const answerUserQuestionFlow = ai.defineFlow(
  {
    name: 'answerUserQuestionFlow',
    inputSchema: AnswerUserQuestionInputSchema,
    outputSchema: AnswerUserQuestionOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await prompt(input);
      console.log('AI Model Raw Output:', output); // For debugging server-side

      if (!output || typeof output.answer !== 'string' || output.answer.trim() === '') {
        console.error('answerUserQuestionFlow: AI model did not return a valid answer. Output:', output);
        return { answer: "ขออภัยค่ะ Momu Ai ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ" };
      }
      return output;
    } catch (error) {
      console.error('Error in answerUserQuestionFlow:', error);
      let errorMessage = "ขออภัยค่ะ เกิดข้อผิดพลาดบางอย่างกับ Momu Ai ทำให้ไม่สามารถตอบคำถามได้ โปรดลองอีกครั้งในภายหลังค่ะ";
      // Log more detailed error server-side
      if (error instanceof Error && error.message) {
        console.error('Detailed error message:', error.message);
        if (error.stack) console.error('Error stack:', error.stack);
      }
      return { answer: errorMessage };
    }
  }
);
