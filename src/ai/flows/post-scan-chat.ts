'use server';
/**
 * @fileOverview A Genkit flow for handling chatbot conversations.
 *
 * - chatWithBot - A function that processes user messages and returns bot responses.
 * - ChatInput - The input type for the chatWithBot function.
 * - ChatOutput - The return type for the chatWithBot function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']).describe("The role of the message sender, either 'user' or 'model' (for AI)."),
  content: z.string().describe("The text content of the message."),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ChatInputSchema = z.object({
  message: z.string().describe("The user's current message to the chatbot."),
  history: z.array(ChatMessageSchema).optional().describe("The history of the conversation so far. Each message has a role ('user' or 'model') and content."),
});
export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  response: z.string().describe("The chatbot's response to the user's message."),
});
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chatWithBot(input: ChatInput): Promise<ChatOutput> {
  return postScanChatFlow(input);
}

const prompt = ai.definePrompt({
  name: 'postScanChatPrompt',
  input: {schema: ChatInputSchema},
  output: {schema: ChatOutputSchema},
  prompt: `You are a friendly and helpful chatbot assistant for the MOMU SCAN application.
Your primary goal is to assist users with their queries, especially related to food, nutrition, and healthy eating.
Be concise and helpful in your responses.

Here is the conversation history (if any):
{{#if history}}
{{#each history}}
{{role}}: {{{content}}}
{{/each}}
{{/if}}

User's current message:
user: {{{message}}}

Your response (as 'model'):
`,
});


const postScanChatFlow = ai.defineFlow(
  {
    name: 'postScanChatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const llmResponse = await prompt(input);
    const output = llmResponse.output;

    if (!output || !output.response) {
      console.error('Chat Flow: AI model did not return a valid response.');
      return { response: "ขออภัยค่ะ ระบบมีปัญหาในการประมวลผลคำขอของคุณ โปรดลองอีกครั้ง" };
    }
    return { response: output.response };
  }
);
