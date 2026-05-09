import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/axios'

function cleanParams(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value != null)
  )
}

export function useTravelClaims(filters = {}) {
  const params = cleanParams(filters)

  // Map frontend camelCase keys to backend snake_case query params
  const backendParams = {
    ...(params.statusFilter  ? { status_filter: params.statusFilter }   : {}),
    ...(params.fromDate      ? { from_date:     params.fromDate }        : {}),
    ...(params.toDate        ? { to_date:       params.toDate }          : {}),
  }

  return useQuery({
    queryKey: ['travel', params],
    queryFn: () => apiClient.get('/api/v1/travel', { params: backendParams }).then((res) => res.data),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  })
}

export function useTravelRoute(expenseId) {
  return useQuery({
    queryKey: ['travel-route', expenseId],
    queryFn: () => apiClient.get(`/api/v1/travel/${expenseId}/route`).then((res) => res.data),
    enabled: !!expenseId,
    staleTime: 10 * 60 * 1000, // routes don't change — cache for 10 min
    gcTime: 15 * 60 * 1000,    // keep only one page-worth in memory
  })
}

export function useTravelHistory(filters = {}) {
  const params = cleanParams(filters)

  return useQuery({
    queryKey: ['travel-history', params],
    queryFn: () => apiClient.get('/api/v1/travel', { params }).then((res) => res.data),
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
  })
}

function invalidateTravelQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['travel'] })
  queryClient.invalidateQueries({ queryKey: ['travel-history'] })
  queryClient.invalidateQueries({ queryKey: ['accounts-claims'] })
}

export function useApproveTravelClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expenseId) =>
      apiClient.patch(`/api/v1/travel/${expenseId}/approve`).then((r) => r.data),
    onSuccess: () => invalidateTravelQueries(queryClient),
  })
}

export function useRejectTravelClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expenseId) =>
      apiClient.patch(`/api/v1/travel/${expenseId}/reject`).then((r) => r.data),
    onSuccess: () => invalidateTravelQueries(queryClient),
  })
}
