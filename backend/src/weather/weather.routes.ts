import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import { logger } from '../logger';
import { getWeather, searchCities, WeatherError } from './weather.service';

const citiesQuerySchema = z.object({
  q: z.string().min(2),
});

const weatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  name: z.string().min(1),
  country: z.string().optional(),
});

const router = Router();

router.get(
  '/cities',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = citiesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const cities = await searchCities(parsed.data.q);
      res.json({ cities });
    } catch (err) {
      if (err instanceof WeatherError) {
        logger.warn(
          `[weather] city search failed (${err.status}): ${err.message}`,
        );
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = weatherQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid query',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    try {
      const weather = await getWeather(
        parsed.data.lat,
        parsed.data.lon,
        parsed.data.name,
        parsed.data.country,
      );
      res.json({ weather });
    } catch (err) {
      if (err instanceof WeatherError) {
        logger.warn(
          `[weather] forecast failed (${err.status}): ${err.message}`,
        );
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

export default router;
