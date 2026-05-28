import { z } from 'zod';

export const messageInputSchema = z.object({
  city: z.string().trim().min(1).max(100),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  message: z.string().min(1).max(280),
  severity: z.enum(['info', 'warning', 'alert']).default('info'),
});

// History is queried by coordinates rather than name — two cities sharing a
// name (e.g. Melbourne, AU vs Melbourne, FL) have distinct histories.
export const historyQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
