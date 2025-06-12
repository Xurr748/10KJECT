
import { config } from 'dotenv';
config();

import '@/ai/flows/food-image-analyzer.ts';
import '@/ai/flows/post-scan-chat.ts'; // Add this line to register the new chat flow

