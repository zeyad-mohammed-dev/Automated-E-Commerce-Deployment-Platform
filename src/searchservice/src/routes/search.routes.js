import { Router } from 'express';
import * as searchController from '../controllers/search.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/', asyncHandler(searchController.search));
router.get('/suggestions', asyncHandler(searchController.suggestions));

export default router;
