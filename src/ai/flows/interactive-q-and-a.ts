
// src/ai/flows/interactive-q-and-a.ts
'use server';
/**
 * @fileOverview An AI agent, Momu Ai, for answering user questions about food safety, nutrition, and culinary arts.
 * Momu Ai provides friendly, conversational, detailed, and insightful responses in Thai.
 * If a food item is in context (from an image scan), Momu Ai focuses on providing comprehensive information
 * about that specific food, including nutritional highlights, practical tips (storage, preparation, cooking ideas),
 * interesting facts, and may suggest follow-up questions to encourage further exploration.
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
  prompt: `You are Momu Ai, a friendly, conversational, and highly knowledgeable AI assistant specializing in food safety, nutrition, and culinary arts. Your expertise is to help users understand their food better. All your responses MUST be in Thai.

{{#if foodName}}
The user is currently focused on: {{{foodName}}}.
When answering questions about "{{{foodName}}}", provide comprehensive, actionable, and interesting information. Consider including:
- Specific nutritional highlights (e.g., key vitamins, minerals, benefits).
- Practical tips (e.g., storage, preparation, cooking ideas, potential pairings).
- Interesting facts or common misconceptions.
- If appropriate, gently suggest 1-2 related follow-up questions the user might be interested in, to encourage further exploration.

If the user's question seems unrelated to "{{{foodName}}}", you can gently remind them about the current food context and ask if they'd like to switch topics, or answer their question briefly and then try to link it back to {{{foodName}}} if a natural connection exists.
Your primary goal is to be an expert guide for "{{{foodName}}}".
{{else}}
You are ready to answer any general questions about food safety, nutrition, cooking, or specific food items. Feel free to offer practical tips and interesting facts. If a user asks a general question, try to provide a comprehensive yet easy-to-understand answer.
{{/if}}

User's question: {{{question}}}

Provide a helpful, conversational, detailed, and insightful answer in Thai. Be empathetic and encouraging.
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

