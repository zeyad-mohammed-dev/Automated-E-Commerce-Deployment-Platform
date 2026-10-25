import * as searchService from '../services/search.service.js';
import { successResponse } from '../utils/response/success.response.js';

export const search = async (req, res) => {
  const data = await searchService.searchProducts(req.query);
  return successResponse({ res, message: 'Search completed successfully', data });
};

export const suggestions = async (req, res) => {
  const items = await searchService.getSuggestions(req.query.q);
  return successResponse({
    res,
    message: 'Suggestions fetched successfully',
    data: { query: String(req.query.q || ''), suggestions: items },
  });
};
