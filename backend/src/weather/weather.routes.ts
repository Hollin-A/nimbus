import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import { validateQuery } from '../middleware/validation';
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
  validateQuery(citiesQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const cities = await searchCities(res.locals.query.q);
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
  validateQuery(weatherQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { lat, lon, name, country } = res.locals.query;
      const weather = await getWeather(lat, lon, name, country);
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
