import { Router } from 'express';
import {
  privacyChoicesPage,
  privacyPage,
  supportPage,
  termsPage,
} from '../controllers/public.controller';

const router = Router();

router.get('/support', supportPage);
router.get('/privacy-choices', privacyChoicesPage);
router.get('/legal/privacy', privacyPage);
router.get('/legal/terms', termsPage);

export default router;
