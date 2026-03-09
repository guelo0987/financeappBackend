import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../controllers/transactions.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', listTransactions);
router.post('/', createTransaction);
router.get('/:id', getTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;

