import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getAlerts, getUnreadCount, markAllAsRead, markAsRead } from '../controllers/alerts.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getAlerts);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
