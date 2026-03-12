import { useState } from 'react'
import { queryDiagnostics } from '../services/api'

interface QueryInterfaceProps {
  bundlePaths: string[]
}

export default function QueryInterface({ bundlePaths }: QueryInterfaceProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [suggested, setSuggested] = useState<string[]>([])
  const [kbaArticles, setKbaArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleAsk = async () => {
    if (!question.trim()) return

    setLoading(true)
    setAnswer('')
    setKbaArticles([])

    try {
      const result = await queryDiagnostics(question, bundlePaths)

      // Check if question is asking for KBA/docs/links/references
      const questionLower = question.toLowerCase()
      const isKBARequest = questionLower.includes('kba') ||
                          questionLower.includes('documentation') ||
                          questionLower.includes('reference') ||
                          questionLower.includes('article') ||
                          questionLower.includes('link')

      // Always set KBA articles
      setKbaArticles(result.kba_articles || [])

      // If asking for KBA, don't show AI answer (just KBA links)
      if (isKBARequest) {
        setAnswer('') // No AI answer - KBA only
      } else {
        // Normal question - show AI answer
        setAnswer(result.answer || '')
      }

      setSuggested(result.suggested_questions || [])
    } catch (error) {
      console.error('Query failed:', error)
      setAnswer('❌ Failed to get answer. Make sure API server is running and Claude API is configured.')
    } finally {
      setLoading(false)
    }
  }

  const handleSuggestedClick = async (q: string) => {
    setQuestion(q)
    setTimeout(async () => {
      if (!loading) {
        setLoading(true)
        setAnswer('')
        setKbaArticles([])

        try {
          const result = await queryDiagnostics(q, bundlePaths)
          setAnswer(result.answer)
          setSuggested(result.suggested_questions || [])
          setKbaArticles(result.kba_articles || [])
        } catch (error) {
          console.error('Query failed:', error)
          setAnswer('❌ Failed to get answer.')
        } finally {
          setLoading(false)
        }
      }
    }, 100)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border-t-4" style={{ borderColor: '#00C7B7' }}>
      <h2 className="text-3xl font-bold mb-4 flex items-center space-x-3" style={{ color: '#0C4F60' }}>
        <span>⚡</span>
        <span>Ask Solace Chat</span>
        <span className="text-sm font-semibold text-white px-3 py-1 rounded-full" style={{ backgroundColor: '#00C7B7' }}>
          SAM + KBA Search
        </span>
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Your Question:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleAsk()}
              placeholder="e.g., Why is the spool down? How to fix mate link issues?"
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:border-blue-500 transition-colors"
              disabled={loading}
              style={{ borderColor: loading ? '#00C7B7' : undefined }}
            />
            <button
              onClick={handleAsk}
              disabled={loading || !question.trim()}
              className="px-8 py-3 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              style={{
                background: loading ? '#6B3FA0' : 'linear-gradient(135deg, #00C7B7 0%, #6B3FA0 100%)'
              }}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Searching...</span>
                </span>
              ) : 'Ask'}
            </button>
          </div>
        </div>

        {/* Answer (Only if not KBA-only request) */}
        {answer && (
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 shadow-lg border-2 animate-fadeSlideIn" style={{ borderColor: 'rgba(0, 199, 183, 0.3)' }}>
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-2xl">⚡</span>
              <h3 className="font-bold text-lg" style={{ color: '#0C4F60' }}>Solace Chat Answer:</h3>
            </div>
            <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">{answer}</div>
          </div>
        )}

        {/* KBA Articles - Always show if available */}
        {kbaArticles.length > 0 && (
          <div className="bg-white rounded-lg p-6 shadow-lg border-l-4 animate-slideIn" style={{ borderColor: '#6B3FA0' }}>
            <h3 className="font-bold text-lg flex items-center space-x-2 mb-4" style={{ color: '#0C4F60' }}>
              <span>📚</span>
              <span>Solace KBA Articles ({kbaArticles.length})</span>
            </h3>
            <div className="space-y-2">
              {kbaArticles.map((article, idx) => (
                <div key={idx} className="flex items-start space-x-2 hover:bg-gray-50 p-2 rounded transition-colors">
                  <span className="text-lg flex-shrink-0">📄</span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:underline"
                    style={{ color: '#0C4F60' }}
                  >
                    {article.title}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Questions */}
        {suggested.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center space-x-2">
              <span>💡</span>
              <span>Suggested Questions:</span>
            </h3>
            <div className="space-y-2">
              {suggested.slice(0, 5).map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedClick(q)}
                  disabled={loading}
                  className="block w-full text-left px-4 py-3 bg-gray-100 hover:bg-blue-50 rounded-lg text-sm text-gray-700 hover:text-blue-700 transition-all shadow hover:shadow-md disabled:opacity-50 transform hover:scale-102"
                >
                  <span className="font-medium">{idx + 1}.</span> {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
