import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/axios'

/**
 * Fetch paginated task list.
 * Filters: status, department, dateFrom, dateTo, search
 */
export function useTasks(filters = {}) {
  // Strip empty values so they don't pollute query params
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== '' && v != null)
  )

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () =>
      apiClient.get('/api/v1/tasks', { params }).then((r) => r.data),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
}

/** Activity type reference list for the Create Task form. */
export function useActivityTypes(options = {}) {
  return useQuery({
    queryKey: ['activity-types'],
    queryFn: () => apiClient.get('/api/v1/activity-types').then((r) => r.data),
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}

/** Field staff list for the Assigned To dropdown. */
export function useFieldStaff(options = {}) {
  return useQuery({
    queryKey: ['users', 'field'],
    queryFn: () =>
      apiClient.get('/api/v1/users', { params: { role: 'FIELD' } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}

/** Create a new task. */
export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload) =>
      apiClient.post('/api/v1/tasks', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/** Update (edit/reassign) an existing task. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, ...body }) =>
      apiClient.patch(`/api/v1/tasks/${taskId}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/** Permanently delete a task (manager/owner only). */
export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId) =>
      apiClient.delete(`/api/v1/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/** Fetch all completion records for a task (for manager/owner location view). */
export function useTaskRecords(taskId, options = {}) {
  return useQuery({
    queryKey: ['task-records', taskId],
    queryFn: () => apiClient.get(`/api/v1/tasks/${taskId}/records`).then((r) => r.data),
    enabled: !!taskId,
    staleTime: 30_000,
    ...options,
  })
}

/** Submit a completion record for a task (field role). */
export function useSubmitRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, ...body }) =>
      apiClient.post(`/api/v1/tasks/${taskId}/records`, body).then((r) => r.data),
    onSuccess: (_data, variables) => {
      // Refresh task list (counts, status) and the specific task's record list
      // so owner/manager sees the new submission + location immediately.
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task-records', variables.taskId] })
    },
  })
}
