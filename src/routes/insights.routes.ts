import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getInsights } from '../controllers/insights.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', getInsights);

export default router;

