// One pagination rule for every list API: invalid page -> 1, limit clamped to [1, maxLimit].
const MAX_PAGE = 100000;
const MAX_LIMIT = 100;

const toInteger = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = MAX_LIMIT } = {}) => {
  const cap = Math.min(MAX_LIMIT, maxLimit);
  const rawPage = toInteger(query?.page);
  const rawLimit = toInteger(query?.limit);
  const page = rawPage !== null && rawPage >= 1 ? Math.min(rawPage, MAX_PAGE) : 1;
  const limit = rawLimit === null ? Math.min(defaultLimit, cap) : Math.min(cap, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
};

const buildPagination = ({ page, limit }, total) => ({
  page,
  limit,
  total: Number(total || 0),
  totalPages: Math.ceil(Number(total || 0) / limit),
});

module.exports = { MAX_LIMIT, buildPagination, parsePagination };
