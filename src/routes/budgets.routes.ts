import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  activateBudget,
  addBudgetCategory,
  createBudget,
  deleteBudget,
  deleteBudgetCategory,
  getBudgetById,
  getBudgets,
  getBudgetSpending,
  updateBudget,
  updateBudgetCategory,
} from '../controllers/budgets.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getBudgets);
router.post('/', createBudget);
router.get('/:id', getBudgetById);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);
router.patch('/:id/activate', activateBudget);
router.get('/:id/spending', getBudgetSpending);
router.post('/:id/categories', addBudgetCategory);
router.put('/:id/categories/:catId', updateBudgetCategory);
router.delete('/:id/categories/:catId', deleteBudgetCategory);

export default router;

