import { z } from 'zod';

export const messageInputSchema = z.object({
  city: z.string().trim().min(1).max(100),
  message: z.string().min(1).max(280),
  severity: z.enum(['info', 'warning', 'alert']).default('info'),
});

export const historyQuerySchema = z.object({
  city: z.string().trim().min(1),
});

export type MessageInput = z.infer<typeof messageInputSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
