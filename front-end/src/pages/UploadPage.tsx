import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/FileUploader'
import StepIndicator from '../components/StepIndicator'
import DecryptModal from '../components/DecryptModal'
import { initializeBundles, startDecrypt, addLocalPath } from '../services/api'

/**
 * Strip GD file extensions to get the base broker name.
 * Mirrors handle_gather_diagnostics.py strip_extensions():
 *   fra1.tgz         → fra1
 *   fra1.tgz.p7m     → fra1
 *   fra1.tgz.p7m.tgz → fra1
 *   fra1  (folder)   → fra1
 */
function baseGdName(path: string): string {
  let name = path.replace(/\\/g, '/').split('/').pop() || path
  if (name.endsWith('.p7m')) name = name.slice(0, -4)
  if (name.includes('.tgz') || name.includes('.tar.gz')) {
    const idx = name.indexOf('.t')
    if (idx !== -1) name = name.slice(0, idx)
  }
  return name.toLowerCase()
}

/**
 * How much work is required to use this GD — lower is better.
 *   folder           → 0  (already extracted, zero work)
 *   .tgz / .tar.gz   → 1  (extract only)
 *   .tgz.p7m         → 2  (decrypt + extract)
 *   .tgz.p7m.tgz     → 3  (extract + decrypt + extract)
 */
function gdComplexity(path: string): number {
  const name = (path.replace(/\\/g, '/').split('/').pop() || path).toLowerCase()
  if (name.endsWith('.tgz') && name.includes('.p7m')) return 3
  if (name.endsWith('.p7m')) return 2
  if (name.endsWith('.tgz') || name.endsWith('.tar.gz') || name.endsWith('.tar')) return 1
  return 0
}

/** JSON.stringify that silently drops circular references instead of throwing. */
function safeStringify(data: any): string {
  const seen = new WeakSet()
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined
      seen.add(value)
    }
    return value
  })
}

interface DecryptSession {
  sessionId: string
  fileName: string
  p7mPath: string
}

function UploadPage() {
  const navigate = useNavigate()
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [decryptSession, setDecryptSession] = useState<DecryptSession | null>(null)
  const [localPathInput, setLocalPathInput] = useState('')

  // On mount: restore GD paths from a previous session so the user can add more
  // without losing their already-discovered brokers.
  useEffect(() => {
    const stored = sessionStorage.getItem('analysisResults')
    if (!stored) return
    try {
      const data = JSON.parse(stored)
      const paths: string[] = data.gd_paths || []
      if (paths.length === 0) return
      setUploadedPaths(paths)
      setUploadedFiles(paths.map((p: string) => ({
        name: p.replace(/\\/g, '/').split('/').pop() || p,
        size: 0,  // previously loaded — exact size not stored
      })))
    } catch {}
  }, [])

  const handleFilesUploaded = async (newPaths: string[], newFiles: any[]) => {
    // Accumulate with smart replacement:
    // - New broker (no existing entry) → add
    // - Same base name, incoming is simpler (lower complexity) → replace existing
    // - Same base name, incoming is same or more complex → skip
    setUploadedPaths(prev => {
      const result = [...prev]
      for (const newPath of newPaths) {
        const base = baseGdName(newPath)
        const idx = result.findIndex(p => baseGdName(p) === base)
        if (idx === -1) {
          result.push(newPath)
        } else if (gdComplexity(newPath) < gdComplexity(result[idx])) {
          result[idx] = newPath
        }
        // else: same or more complex — skip
      }
      return result
    })

    setUploadedFiles(prev => {
      const result = [...prev]
      for (const newFile of newFiles) {
        const base = baseGdName(newFile.name)
        const idx = result.findIndex((f: any) => baseGdName(f.name) === base)
        if (idx === -1) {
          result.push(newFile)
        } else if (gdComplexity(newFile.name) < gdComplexity(result[idx].name)) {
          result[idx] = newFile
        }
      }
      return result
    })

    // Detect p7m files OUTSIDE the state updater to avoid StrictMode double-invoke side effects.
    // Compare against current uploadedPaths (state before this update) to decide if this
    // path would actually be added or would replace an existing entry.
    let p7mToDecrypt: string | null = null
    for (const newPath of newPaths) {
      if (!newPath.toLowerCase().includes('.p7m')) continue
      const base = baseGdName(newPath)
      const existing = uploadedPaths.find(p => baseGdName(p) === base)
      if (!existing || gdComplexity(newPath) < gdComplexity(existing)) {
        p7mToDecrypt = newPath
      }
    }

    if (p7mToDecrypt) {
      const fileName = p7mToDecrypt.replace(/\\/g, '/').split('/').pop() || p7mToDecrypt
      try {
        const result = await startDecrypt(p7mToDecrypt)
        setDecryptSession({ sessionId: result.session_id, fileName, p7mPath: p7mToDecrypt })
      } catch (error) {
        console.error('Failed to start decrypt:', error)
      }
    }
  }

  const handleDecryptComplete = (tgzPath: string) => {
    if (!decryptSession) return
    const updatedPaths = uploadedPaths.map(p => p === decryptSession.p7mPath ? tgzPath : p)
    setUploadedPaths(updatedPaths)
    setDecryptSession(null)
    handleAnalyze(updatedPaths)  // auto-proceed immediately with the decrypted .tgz
  }

  const handleRemoveFile = (index: number) => {
    const newPaths = uploadedPaths.filter((_, idx) => idx !== index)
    const newFiles = uploadedFiles.filter((_, idx) => idx !== index)
    setUploadedPaths(newPaths)
    setUploadedFiles(newFiles)
  }

  const handleClearAll = () => {
    setUploadedPaths([])
    setUploadedFiles([])
  }

  const handleAddLocalPath = async () => {
    const path = localPathInput.trim()
    if (!path) return
    try {
      const result = await addLocalPath(path)
      await handleFilesUploaded([result.path], [{ name: result.name, size: result.size }])
      setLocalPathInput('')
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || String(error)
      alert(`Could not add path: ${msg}`)
    }
  }

  const handleAnalyze = async (pathsOverride?: string[]) => {
    const paths = pathsOverride ?? uploadedPaths
    if (paths.length === 0) return
    setIsAnalyzing(true)
    try {
      const result = await initializeBundles(paths)

      if (result.router_names && result.router_names.length > 0) {
        // Store gd_paths alongside the result so UploadPage can restore them on back-navigation
        sessionStorage.setItem('analysisResults', safeStringify({
          router_contexts: result.router_contexts,
          health_results: {},
          ha_pairs: result.ha_pairs || [],
          replication_pairs: result.replication_pairs || [],
          gd_paths: paths,
        }))
        navigate('/broker-context')
      } else {
        alert('No routers found in the gather-diagnostics files.')
      }
    } catch (error: any) {
      console.error('Discovery failed:', error)
      const msg = error?.response?.data?.detail || error?.message || String(error)
      alert(`Discovery failed: ${msg}\n\nMake sure the backend server is running on port 8000.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-solace-gray-light flex flex-col">
      {/* Header */}
      <header className="bg-solace-dark text-white p-6 shadow-lg border-b-4 border-solace-green">
        <div className="container mx-auto">
          <div>
            <h1 className="text-3xl font-bold">Solace Support</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6 flex-1 flex flex-col">
        <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">Solace Health Check </h2>
            <p className="text-gray-600 mt-2">Upload, analyze, and diagnose your Solace brokers</p>
          </div>

          <div className="mb-8">
            <StepIndicator currentStep={1} />
          </div>

          {/* Center Upload Section */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="w-full bg-white rounded-lg shadow-lg p-10">
              <FileUploader onFilesUploaded={handleFilesUploaded} onUploadingChange={setIsUploading} />

              {/* Local path input — no upload needed, file stays on disk */}
              <div className="mt-6">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-gray-400 text-sm whitespace-nowrap">or add a local path</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="mt-4 flex gap-3">
                  <input
                    type="text"
                    value={localPathInput}
                    onChange={e => setLocalPathInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLocalPath()}
                    placeholder="C:\path\to\gather-diagnostics | gather-diagnostics.tgz | gather-diagnostics.tgz.p7m"
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-solace-green"
                  />
                  <button
                    onClick={handleAddLocalPath}
                    disabled={!localPathInput.trim()}
                    className="bg-solace-green text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-solace-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {uploadedPaths.length > 0 && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => handleAnalyze()}
                    disabled={isAnalyzing || isUploading}
                    className="bg-solace-green text-white px-8 py-3 rounded-lg font-semibold hover:bg-solace-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center space-x-2 justify-center">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Discovering...</span>
                      </span>
                    ) : (
                      `Discover ${uploadedPaths.length} Broker${uploadedPaths.length > 1 ? 's' : ''}`
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Uploaded Files - Fixed at Bottom */}
        {uploadedFiles.length > 0 && (
          <div className="max-w-4xl mx-auto w-full mt-6">
            <div className="bg-white rounded-lg shadow-lg p-6 border-t-4 border-solace-green">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">Uploaded Files ({uploadedFiles.length})</h3>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-solace-red hover:text-solace-red-dark font-semibold transition-colors px-4 py-2 rounded hover:bg-solace-red-50"
                >
                  Clear All
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                {uploadedFiles.map((file: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-solace-gray-light p-3 rounded-lg border border-gray-300">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Previously loaded'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      className="ml-3 text-solace-red hover:text-solace-red-dark font-semibold text-sm px-3 py-1 rounded hover:bg-solace-red-100 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-solace-dark-darker text-white text-center p-6 border-t-2 border-solace-green" />

      {/* Decrypt modal — shown automatically when a .p7m file is uploaded */}
      {decryptSession && (
        <DecryptModal
          sessionId={decryptSession.sessionId}
          fileName={decryptSession.fileName}
          onComplete={handleDecryptComplete}
          onClose={() => setDecryptSession(null)}
        />
      )}
    </div>
  )
}

export default UploadPage
