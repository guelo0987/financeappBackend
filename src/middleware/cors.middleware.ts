import cors from 'cors';

export const corsMiddleware = cors({
  origin: true,
  credentials: true,
});

