import { Router } from 'express';
import { revenueCatWebhook } from '../controllers/webhooks.controller';

const router = Router();

// No auth middleware — RC authenticates via Authorization header
router.post('/revenuecat', revenueCatWebhook);

export default router;
