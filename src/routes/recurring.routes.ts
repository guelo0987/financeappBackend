import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  processRecurring,
  toggleRecurring,
  updateRecurring,
} from '../controllers/recurring.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', listRecurring);
router.post('/', createRecurring);
router.put('/:id', updateRecurring);
router.patch('/:id/toggle', toggleRecurring);
router.delete('/:id', deleteRecurring);
router.post('/process', processRecurring);

export default router;

