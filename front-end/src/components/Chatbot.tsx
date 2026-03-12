import { useState, useRef, useEffect } from 'react'
import { chatbotQuery } from '../services/api'
import axios from 'axios'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  confluenceLinks?: Array<{ title: string; url: string }>
  timestamp: Date
}

interface ChatbotProps {
  context?: any
  initialMessages?: Message[]
  panel?: boolean
  onClose?: () => void
  contextKey?: string  // changes when the broker tab switches → aborts in-flight request
}

export default function Chatbot({ context, initialMessages, panel, onClose, contextKey }: ChatbotProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Sync if initialMessages changes (e.g. panel opened with new seed)
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages)
    }
  }, [initialMessages])

  // Abort any in-flight request when the broker tab switches
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [contextKey])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await chatbotQuery(userMessage.content, context, controller.signal)

      const text = response.response || ''

      const looksEmpty = !text.trim()
      const looksEchoed = text.trim().startsWith('You are a Solace support engineer') ||
                          text.trim().startsWith('Available data files')

      let content: string
      if (looksEmpty || looksEchoed) {
        content = 'Claude did not return a response. This usually means the Claude CLI is not running or the plugin is not configured. Check that the backend server started correctly and that `claude` is available on the PATH.'
      } else {
        content = text
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content,
        confluenceLinks: response.confluence_links || [],
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

    } catch (error: any) {
      // Silently discard if the request was cancelled by a tab switch
      if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
        return
      }
      console.error('Chatbot error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to get response'}. Make sure the backend server is running on port 8000.`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      abortControllerRef.current = null
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chatbot-container flex flex-col h-full bg-white rounded-lg shadow-lg border border-gray-300">
      {/* Header */}
      <div className="chatbot-header bg-solace-green text-white p-4 rounded-t-lg flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Ask Claude
          </h3>
          <p className="text-sm text-gray-100 mt-1">Ask questions about your health check results</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-4 text-white/80 hover:text-white transition-colors p-1 rounded hover:bg-white/20"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="messages flex-1 overflow-y-auto p-4 space-y-4"
        style={panel ? { minHeight: 0 } : { maxHeight: '500px', minHeight: '300px' }}
      >
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="font-semibold">Start a conversation</p>
            <p className="text-sm mt-2">Ask about failures, warnings, or troubleshooting steps</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 shadow-md ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-solace-green to-solace-green-dark text-white'
                  : 'bg-white border-2 border-gray-200 text-gray-800'
              }`}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
              }}
            >
              <div className="prose prose-sm max-w-none">
                <div
                  className="text-sm leading-relaxed"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
                      .replace(/\n/g, '<br/>')
                      .replace(/\[([^\]]+)\]\((https?:\/\/sol-jira\.atlassian\.net[^\)]+)\)/g,
                        '<a href="$2" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-solace-green hover:text-solace-green-dark font-semibold underline hover:no-underline transition-colors"><span>$1</span><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>')
                      .replace(/(https?:\/\/sol-jira\.atlassian\.net[^\s<]+)/g,
                        '<a href="$1" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline hover:no-underline break-all"><span>$1</span><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg></a>')
                  }}
                />
              </div>

              <div className={`text-xs mt-3 ${msg.role === 'user' ? 'text-white/70' : 'text-gray-400'} font-medium`}>
                {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="message flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-solace-green" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-gray-600">Claude is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-area p-5 border-t-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white rounded-b-lg">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about failures, troubleshooting, or search Confluence KBAs... (Shift+Enter for new line)"
            className="flex-1 p-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-solace-green focus:border-solace-green resize-none text-base shadow-sm"
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
            rows={2}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-gradient-to-br from-solace-green to-solace-green-dark text-white px-8 py-2 rounded-xl font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all self-end transform hover:scale-105"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </div>
        <div className="flex justify-end mt-3">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-solace-green">Claude + MCP</span>
          </p>
        </div>
      </div>
    </div>
  )
}
