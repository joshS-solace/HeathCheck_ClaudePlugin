import { useEffect, useRef, useState } from 'react'

const API_BASE_URL = 'http://localhost:8000'

interface DecryptLine {
  id: number
  type: 'stdout' | 'stderr' | 'done' | 'error'
  text: string
}

interface ParsedContent {
  url?: string
  password?: string
  code?: string
}

function parseContent(text: string): ParsedContent {
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/)
  const passMatch = text.match(/(?:password|pwd)\s*[:=]\s*(\S+)/i)
  // Device code: uppercase alphanumeric run of 6-12 chars on a line that mentions "code" or stands alone
  const codeLineMatch = /(?:code|token|enter)[^a-z]*([A-Z0-9]{6,12})/i.exec(text)
  return {
    url: urlMatch?.[1],
    password: passMatch?.[1],
    code: !passMatch && codeLineMatch ? codeLineMatch[1] : undefined,
  }
}

interface DecryptModalProps {
  sessionId: string
  fileName: string
  onComplete: (tgzPath: string) => void
  onClose: () => void
}

export default function DecryptModal({ sessionId, fileName, onComplete, onClose }: DecryptModalProps) {
  const [lines, setLines] = useState<DecryptLine[]>([])
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running')
  const [tgzPath, setTgzPath] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const doneRef = useRef(false)

  useEffect(() => {
    const es = new EventSource(`${API_BASE_URL}/api/decrypt-stream/${sessionId}`)

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'end') {
        es.close()
        return
      }

      if (data.type === 'done') {
        doneRef.current = true
        setStatus('done')
        setTgzPath(data.tgz_path)
        setLines(prev => [...prev, { id: nextId.current++, type: 'done', text: data.line }])
      } else if (data.type === 'error') {
        setStatus('error')
        setLines(prev => [...prev, { id: nextId.current++, type: 'error', text: data.line }])
      } else {
        setLines(prev => [...prev, { id: nextId.current++, type: data.type, text: data.line }])
      }
    }

    es.onerror = () => {
      if (!doneRef.current) {
        setStatus('error')
        setLines(prev => [...prev, {
          id: nextId.current++,
          type: 'error',
          text: 'Connection lost — decrypt-cms may still be running in the backend terminal.'
        }])
      }
      es.close()
    }

    return () => es.close()
  }, [sessionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const renderLine = (line: DecryptLine) => {
    const { url, password, code } = parseContent(line.text)
    const isError = line.type === 'error'
    const isDone = line.type === 'done'

    return (
      <div key={line.id} className="flex justify-start">
        <div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${
          isDone
            ? 'bg-green-50 border-2 border-green-400'
            : isError
            ? 'bg-red-50 border-2 border-red-300'
            : 'bg-white border-2 border-gray-200'
        }`}>
          {url ? (
            <div className="text-sm space-y-1">
              <p className="text-gray-700">{line.text.replace(url, '').trim()}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-solace-blue font-semibold underline break-all block"
              >
                {url}
              </a>
            </div>
          ) : password ? (
            <div className="text-sm flex items-center gap-2 flex-wrap">
              <span className="text-gray-600">
                {line.text.replace(password, '').replace(/[:=]$/, '').trim()}:
              </span>
              <code className="bg-green-100 text-green-800 px-3 py-1 rounded font-mono font-bold text-base tracking-widest">
                {password}
              </code>
            </div>
          ) : code ? (
            <div className="text-sm flex items-center gap-2 flex-wrap">
              <span className="text-gray-700">{line.text.replace(code, '').trim()}</span>
              <code className="bg-solace-blue text-white px-3 py-1 rounded font-mono font-bold text-lg tracking-widest">
                {code}
              </code>
            </div>
          ) : (
            <p className={`text-sm font-mono ${
              isError ? 'text-red-700' : isDone ? 'text-green-700 font-semibold' : 'text-gray-700'
            }`}>
              {line.text}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="bg-solace-green text-white p-4 rounded-t-lg flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Decrypting: {fileName}
            </h3>
            <p className="text-sm text-white/80 mt-0.5">
              {status === 'running'
                ? 'Waiting for authentication...'
                : status === 'done'
                ? 'Decryption complete'
                : 'Decryption failed'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50" style={{ minHeight: '280px' }}>
          {lines.length === 0 && (
            <div className="flex items-center justify-center gap-2 text-gray-500 mt-10">
              <svg className="animate-spin h-5 w-5 text-solace-green" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p>Starting decrypt-cms.exe...</p>
            </div>
          )}

          {lines.map(renderLine)}

          {status === 'running' && lines.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-solace-green" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-gray-600">Waiting...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-gray-200 bg-white rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          {status === 'done' && tgzPath && (
            <button
              onClick={() => onComplete(tgzPath)}
              className="px-6 py-2 bg-solace-green text-white rounded-lg font-semibold hover:bg-solace-green-dark transition-colors"
            >
              Continue →
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
