import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

const normalizePositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

const normalizePageSize = (value) => {
  const pageSize = normalizePositiveInteger(value, DEFAULT_PAGE_SIZE);
  return PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
};

export const useUrlPagination = ({
  pageParam = "page",
  pageSizeParam = "pageSize",
} = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = useMemo(
    () => normalizePositiveInteger(searchParams.get(pageParam), 1),
    [pageParam, searchParams],
  );
  const pageSize = useMemo(
    () => normalizePageSize(searchParams.get(pageSizeParam)),
    [pageSizeParam, searchParams],
  );

  const setPagination = useCallback(
    (nextPage = 1, nextPageSize = pageSize) => {
      const normalizedPage = normalizePositiveInteger(nextPage, 1);
      const normalizedPageSize = normalizePageSize(nextPageSize);
      setSearchParams(
        (currentParams) => {
          const nextParams = new URLSearchParams(currentParams);
          if (normalizedPage > 1) {
            nextParams.set(pageParam, String(normalizedPage));
          } else {
            nextParams.delete(pageParam);
          }
          if (normalizedPageSize !== DEFAULT_PAGE_SIZE) {
            nextParams.set(pageSizeParam, String(normalizedPageSize));
          } else {
            nextParams.delete(pageSizeParam);
          }
          return nextParams;
        },
        { replace: true },
      );
    },
    [pageParam, pageSize, pageSizeParam, setSearchParams],
  );

  const setPage = useCallback(
    (nextPage) => setPagination(nextPage, pageSize),
    [pageSize, setPagination],
  );

  return {
    page,
    pageSize,
    setPage,
    setPagination,
  };
};
