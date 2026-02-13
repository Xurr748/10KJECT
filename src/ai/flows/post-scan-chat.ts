'use server';
/**
 * @fileOverview A chatbot flow for post-scan Q&A.
 *
 * - chatWithBot - A function to interact with the chat flow.
 * - ChatInput - The input type for the chatWithBot function.
 * - ChatOutput - The return type for the chatWithBot function.
 * - ChatMessage - The type for a single message in the conversation history.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string().max(1000),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const ChatInputSchema = z.object({
  message: z.string().max(1000),
  history: z.array(ChatMessageSchema).optional(),
});

export type ChatInput = z.infer<typeof ChatInputSchema>;

const ChatOutputSchema = z.object({
  response: z.string(),
});

export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export async function chatWithBot(input: ChatInput): Promise<ChatOutput> {
  return postScanChatFlow(input);
}

function sanitize(text: string) {
  return text.replace(
    /(ignore previous instructions|system prompt|developer mode)/gi,
    ''
  );
}

const prompt = ai.definePrompt({
  name: 'postScanChatPrompt',
  input: { schema: ChatInputSchema },
  output: { schema: ChatOutputSchema },
  model: 'googleai/gemini-1.5-flash-latest',
  config: {
    temperature: 0.4,
    maxOutputTokens: 400,
  },
  prompt: `
You are a friendly nutrition assistant for MOMU SCAN.
- Keep responses under 150 words.
- Be practical.
- Avoid medical diagnosis.
- Respond only in Thai.
- Do not mention you are an AI model.

Conversation history:
{{#if history}}
{{#each history}}
{{role}}: {{{content}}}
{{/each}}
{{/if}}

User:
{{{message}}}

Response:
`,
});

const postScanChatFlow = ai.defineFlow(
  {
    name: 'postScanChatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async input => {
    try {
      const limitedHistory = input.history?.slice(-10);

      const safeInput = {
        message: sanitize(input.message),
        history: limitedHistory?.map(m => ({
          ...m,
          content: sanitize(m.content),
        })),
      };

      const llmResponse = await prompt(safeInput);
      const output = llmResponse.output;

      if (!output?.response) {
        throw new Error('Invalid AI response');
      }

      return { response: output.response };
    } catch (err) {
      console.error('Chat Flow Error:', err);
      return {
        response:
          'ขออภัยค่ะ ระบบกำลังมีปัญหาในการประมวลผล กรุณาลองใหม่อีกครั้ง',
      };
    }
  }
);
