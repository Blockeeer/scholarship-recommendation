/**
 * Pagination utilities for Firestore queries and array-based data
 */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * Get pagination parameters from request query
 * @param {object} query - Request query object
 * @param {number} defaultLimit - Default items per page
 * @returns {object} - { page, limit, offset }
 */
function getPaginationParams(query, defaultLimit = DEFAULT_PAGE_SIZE) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || defaultLimit;

  // Ensure valid values
  page = Math.max(1, page);
  limit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Paginate an array of items
 * @param {Array} items - Full array of items
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @returns {object} - { data, pagination }
 */
function paginateArray(items, page = 1, limit = DEFAULT_PAGE_SIZE) {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / limit);
  const offset = (page - 1) * limit;

  const paginatedItems = items.slice(offset, offset + limit);

  return {
    data: paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null
    }
  };
}

/**
 * Build pagination UI data for EJS templates
 * @param {object} pagination - Pagination object from paginateArray
 * @param {string} baseUrl - Base URL for pagination links
 * @param {object} queryParams - Additional query parameters to preserve
 * @returns {object} - Pagination UI data
 */
function buildPaginationUI(pagination, baseUrl, queryParams = {}) {
  const { currentPage, totalPages, hasNextPage, hasPrevPage } = pagination;

  // Build query string from additional params
  const params = new URLSearchParams(queryParams);

  // Generate page numbers to display (show 5 pages centered on current)
  const pageNumbers = [];
  const range = 2; // Pages on each side of current

  let startPage = Math.max(1, currentPage - range);
  let endPage = Math.min(totalPages, currentPage + range);

  // Adjust if near start or end
  if (currentPage <= range) {
    endPage = Math.min(totalPages, 5);
  }
  if (currentPage > totalPages - range) {
    startPage = Math.max(1, totalPages - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    params.set('page', i);
    pageNumbers.push({
      number: i,
      url: `${baseUrl}?${params.toString()}`,
      isActive: i === currentPage
    });
  }

  // Build prev/next URLs
  params.set('page', currentPage - 1);
  const prevUrl = hasPrevPage ? `${baseUrl}?${params.toString()}` : null;

  params.set('page', currentPage + 1);
  const nextUrl = hasNextPage ? `${baseUrl}?${params.toString()}` : null;

  // First and last page URLs
  params.set('page', 1);
  const firstUrl = currentPage > 1 ? `${baseUrl}?${params.toString()}` : null;

  params.set('page', totalPages);
  const lastUrl = currentPage < totalPages ? `${baseUrl}?${params.toString()}` : null;

  return {
    ...pagination,
    pageNumbers,
    prevUrl,
    nextUrl,
    firstUrl,
    lastUrl,
    showFirst: currentPage > range + 1,
    showLast: currentPage < totalPages - range
  };
}

/**
 * Create pagination info string
 * @param {object} pagination - Pagination object
 * @returns {string} - e.g., "Showing 1-10 of 50 items"
 */
function getPaginationInfo(pagination) {
  const { currentPage, totalItems, itemsPerPage } = pagination;
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalItems === 0) {
    return 'No items found';
  }

  return `Showing ${start}-${end} of ${totalItems} items`;
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getPaginationParams,
  paginateArray,
  buildPaginationUI,
  getPaginationInfo
};
