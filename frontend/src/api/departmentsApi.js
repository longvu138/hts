import { httpClient } from './httpClient'

const normalizeListResponse = (data) => (Array.isArray(data) ? data : [])

export const departmentsApi = {
  list: async (params = {}) => {
    const { data } = await httpClient.get('/departments', { params })
    return normalizeListResponse(data)
  },
  tree: async (params = {}) => {
    const { data } = await httpClient.get('/departments/tree', { params })
    return normalizeListResponse(data)
  },
  create: async (payload) => {
    const { data } = await httpClient.post('/departments', payload)
    return data
  },
  update: async (id, payload) => {
    const { data } = await httpClient.patch(`/departments/${id}`, payload)
    return data
  },
}
