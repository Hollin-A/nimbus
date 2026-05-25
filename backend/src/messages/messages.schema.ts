import { z } from 'zod';

// Stub: real schemas in the next commit. z.never() so every safeParse fails —
// that flips the "accept" tests in messages.test.ts red. The "reject" tests
// happen to pass coincidentally; that's an acceptable price for keeping no
// implementation in this commit.
export const messageInputSchema = z.never();
export const historyQuerySchema = z.never();
