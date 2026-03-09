import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createWallet,
  deleteWallet,
  getWalletById,
  getWalletSummary,
  getWalletTransactions,
  getWallets,
  updateWallet,
} from '../controllers/wallets.controller';

const router = Router();

router.use(authMiddleware);
router.get('/summary', getWalletSummary);
router.get('/', getWallets);
router.post('/', createWallet);
router.get('/:id', getWalletById);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);
router.get('/:id/transactions', getWalletTransactions);

export default router;

