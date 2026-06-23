import { useState, useEffect, useCallback } from 'react';

interface FetchDataParams {
  cursor?: string;
  limit?: number;
  search?: string;
  [key: string]: any;
}

interface UseCursorTableOptions<T> {
  fetchFn: (params: FetchDataParams) => Promise<{
    items: T[];
    pageInfo: { nextCursor: string | null; hasNextPage: boolean };
  }>;
  initialLimit?: number;
  initialFilters?: Record<string, any>;
}

export const useCursorTable = <T,>({
  fetchFn,
  initialLimit = 10,
  initialFilters = {},
}: UseCursorTableOptions<T>) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [limit, setLimit] = useState(initialLimit);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>(initialFilters);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 450);

    return () => clearTimeout(handler);
  }, [search]);

  const fetchData = useCallback(
    async (currentCursor: string | null = null) => {
      try {
        setLoading(true);
        setError(null);

        const params: FetchDataParams = {
          limit,
          cursor: currentCursor || undefined,
          search: debouncedSearch || undefined,
          ...filters,
        };

        const result = await fetchFn(params);
        setData(result.items);
        setHasNextPage(result.pageInfo.hasNextPage);
        setNextCursor(result.pageInfo.nextCursor);
      } catch (err: any) {
        console.error('Error fetching table data:', err);
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, limit, debouncedSearch, filters]
  );

  useEffect(() => {
    setCursors([null]);
    setCurrentIndex(0);
    fetchData(null);
  }, [debouncedSearch, filters, limit]);

  const handleNextPage = () => {
    if (hasNextPage && nextCursor) {
      const nextIdx = currentIndex + 1;
      const updatedCursors = [...cursors];
      updatedCursors[nextIdx] = nextCursor;
      setCursors(updatedCursors);
      setCurrentIndex(nextIdx);
      fetchData(nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      fetchData(cursors[prevIdx]);
    }
  };

  const updateFilters = (newFilters: Record<string, any>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setSearch('');
  };

  return {
    data,
    loading,
    error,
    search,
    setSearch,
    filters,
    updateFilters,
    resetFilters,
    hasNextPage,
    hasPrevPage: currentIndex > 0,
    handleNextPage,
    handlePrevPage,
    refresh: () => fetchData(cursors[currentIndex]),
    limit,
    setLimit,
  };
};
