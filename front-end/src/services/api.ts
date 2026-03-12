import axios from 'axios'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const uploadFiles = async (files: File[]) => {
  const formData = new FormData()
  files.forEach((file) => {
    formData.append('files', file)
  })

  const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

export const uploadFolder = async (files: File[]) => {
  const formData = new FormData()
  files.forEach((file) => {
    const rel = ((file as any).path || (file as any).webkitRelativePath || file.name)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')  // strip leading slash from entry.fullPath
    formData.append('files', file)
    formData.append('relativePaths', rel)
  })

  const response = await axios.post(`${API_BASE_URL}/api/upload-folder`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  return response.data
}

export const startDecrypt = async (p7mPath: string) => {
  const response = await api.post('/api/decrypt', { p7m_path: p7mPath })
  return response.data  // { session_id: string }
}

export const addLocalPath = async (path: string) => {
  const response = await api.post('/api/local-path', { path })
  return response.data  // { path: string, name: string, size: number, type: 'folder'|'file' }
}

export const analyzeBundles = async (bundlePaths: string[]) => {
  const response = await api.post('/api/analyze', bundlePaths)
  return response.data
}

export const initializeBundles = async (bundlePaths: string[]) => {
  const response = await api.post('/api/initialize', bundlePaths)
  return response.data
}

// ═══════════════════════════════════════════════════════════════════════════
// Plugin Endpoints (Claude Code CLI integration)
// ═══════════════════════════════════════════════════════════════════════════

export const pluginInitialize = async (bundlePaths: string[]) => {
  const response = await api.post('/api/plugin/initialize', bundlePaths)
  return response.data
}

export const pluginAnalyze = async (routerNames: string[]) => {
  const response = await api.post('/api/plugin/analyze', routerNames)
  return response.data
}

export const chatbotQuery = async (question: string, context?: any, signal?: AbortSignal) => {
  const response = await api.post('/api/chatbot/query', { question, context }, { signal })
  return response.data
}

export const getPluginStatus = async () => {
  const response = await api.get('/api/plugin/status')
  return response.data
}

// ═══════════════════════════════════════════════════════════════════════════
// TODO: Backend endpoints not yet implemented - add when ready
// ═══════════════════════════════════════════════════════════════════════════

// export const generateVisualization = async (bundlePaths: string[], useLLM: boolean = true) => {
//   const response = await api.post('/api/visualize', { bundle_paths: bundlePaths, use_llm: useLLM })
//   return response.data
// }

// export const queryDiagnostics = async (question: string, bundlePaths: string[]) => {
//   const response = await api.post('/api/query', { question, bundle_paths: bundlePaths })
//   return response.data
// }
