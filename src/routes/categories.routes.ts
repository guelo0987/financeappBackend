import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategories,
  getSystemCategories,
  updateCategory,
} from '../controllers/categories.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.get('/', getCategories);
router.get('/system', getSystemCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;

