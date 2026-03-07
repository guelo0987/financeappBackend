import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);

app.get('/', (_req, res) => {
  res.json({ data: { mensaje: 'WealthOS API funcionando.' } });
});

// Global error handler — must be after routes
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
