
'use server';

/**
 * @fileOverview Provides an AI agent that answers questions about nutrition and food safety,
 * potentially focusing on a specific food item if provided.
 *
 * - answerNutritionQuestion - A function that answers user questions about nutrition and food safety.
 * - AnswerNutritionQuestionInput - The input type for the answerNutritionQuestion function.
 * - AnswerNutritionQuestionOutput - The return type for the answerNutritionQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnswerNutritionQuestionInputSchema = z.object({
  question: z.string().describe('The question about nutrition or food safety.'),
  foodName: z.string().optional().describe('The name of the food item being discussed, if any. This helps to contextualize the answer.'),
});
export type AnswerNutritionQuestionInput = z.infer<
  typeof AnswerNutritionQuestionInputSchema
>;

const AnswerNutritionQuestionOutputSchema = z.object({
  answer: z.string().describe('The answer to the question (in Thai).'),
});
export type AnswerNutritionQuestionOutput = z.infer<
  typeof AnswerNutritionQuestionOutputSchema
>;

export async function answerNutritionQuestion(
  input: AnswerNutritionQuestionInput
): Promise<AnswerNutritionQuestionOutput> {
  return answerNutritionQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'answerNutritionQuestionPrompt',
  model: 'googleai/gemini-1.5-flash-latest', // Explicitly using Gemini
  input: {schema: AnswerNutritionQuestionInputSchema},
  output: {schema: AnswerNutritionQuestionOutputSchema},
  prompt: `You are Momu Ai, a friendly and knowledgeable AI assistant specializing in nutrition and food safety, especially for seniors. Your responses MUST be in Thai.

{{#if foodName}}
The user is asking a question related to "{{foodName}}". Please try to keep your answer relevant to this food item.
You can offer:
- Key nutritional highlights of "{{foodName}}".
- Practical tips for "{{foodName}}" (e.g., storage, preparation, healthy cooking methods).
- Interesting facts or common uses of "{{foodName}}".
- If appropriate, suggest 1-2 relevant follow-up questions the user might have about "{{foodName}}".
{{else}}
The user is asking a general question about nutrition or food safety.
{{/if}}

User's question: {{{question}}}

Please provide a comprehensive, helpful, and easy-to-understand answer in Thai. Maintain a supportive and conversational tone.
`,
});

const answerNutritionQuestionFlow = ai.defineFlow(
  {
    name: 'answerNutritionQuestionFlow',
    inputSchema: AnswerNutritionQuestionInputSchema,
    outputSchema: AnswerNutritionQuestionOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    if (!output) {
      console.error('AnswerNutritionQuestionFlow: AI model did not return a structured output for the question.');
      // Fallback response if AI fails to provide structured output
      return { answer: "ขออภัยค่ะ Momu ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ โปรดลองอีกครั้งนะคะ" };
    }
    return output;
  }
);
