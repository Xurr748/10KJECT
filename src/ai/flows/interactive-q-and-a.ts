
// src/ai/flows/interactive-q-and-a.ts
'use server';
/**
 * @fileOverview An AI agent for answering user questions about food safety and nutrition.
 * The AI's conversation should primarily focus on the food item context if provided.
 *
 * - askQuestion - A function that handles the question answering process.
 * - AskQuestionInput - The input type for the askQuestion function.
 * - AskQuestionOutput - The return type for the askQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AskQuestionInputSchema = z.object({
  question: z.string().describe('The user question about food safety and nutrition.'),
  foodName: z.string().optional().describe('The name of the food item currently in context, if any. This helps the AI focus the conversation.'),
});
export type AskQuestionInput = z.infer<typeof AskQuestionInputSchema>;

const AskQuestionOutputSchema = z.object({
  answer: z.string().describe('The AI-generated answer to the user question.'),
});
export type AskQuestionOutput = z.infer<typeof AskQuestionOutputSchema>;

export async function askQuestion(input: AskQuestionInput): Promise<AskQuestionOutput> {
  return askQuestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'askQuestionPrompt',
  model: 'googleai/gemini-2.0-flash', // Explicitly set Gemini model
  input: {schema: AskQuestionInputSchema},
  output: {schema: AskQuestionOutputSchema},
  prompt: `You are Momu Ai, a friendly, conversational, and knowledgeable AI assistant specializing in food safety, nutrition, and culinary information. All your responses MUST be in Thai.

{{#if foodName}}
The user has recently analyzed a food item identified as: {{{foodName}}}.
Please focus your answers and conversation around this food item: "{{{foodName}}}". Provide detailed, helpful, and relevant information related to {{{foodName}}} when the user asks questions.
If the user's question seems unrelated to {{{foodName}}}, you can gently try to steer the conversation back or clarify if they'd like to discuss {{{foodName}}} further before addressing the unrelated topic.
{{else}}
You are ready to answer any general questions about food safety, nutrition, cooking, or specific food items.
{{/if}}

User's question: {{{question}}}

Provide a helpful, conversational, and detailed answer in Thai.
  `,
});

const askQuestionFlow = ai.defineFlow(
  {
    name: 'askQuestionFlow',
    inputSchema: AskQuestionInputSchema,
    outputSchema: AskQuestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

