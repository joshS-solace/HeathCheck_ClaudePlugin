import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import StepIndicator from '../components/StepIndicator'
import Chatbot, { Message } from '../components/Chatbot'

// Dummy health check results based on the JSON format provided
const dummyHealthCheckResults = {
  reference_date: "2026-02-25",
  overall: "FAIL",
  results: [
    {
      section: "1.1",
      description: "Installed SolOS release is currently supported.",
      status: "FAIL",
      failures: [
        {
          message: "SolOS 10.4.1.219 is not in the known supported versions list.",
          matches: []
        }
      ]
    },
    {
      section: "1.2",
      description: "Chassis product number is currently supported.",
      status: "PASS",
      failures: []
    },
    {
      section: "2.1",
      description: "Uptime and last restart reason checked.",
      status: "PASS",
      failures: []
    },
    {
      section: "2.2",
      description: "No recent critical SYSTEM_* events.",
      status: "FAIL",
      failures: [
        {
          message: "Critical SYSTEM_* events found in logs. (source: event.log.1)",
          matches: [
            {
              source: "event.log.1",
              timestamp: "2026-02-23T03:20:28",
              line: "2026-02-23T03:20:28+0100 <local3.warning> FFGCGEMEASOLAPL01P event: SYSTEM: SYSTEM_CHASSIS_POWER_MODULE_DOWN: - - Power Module 1 down",
              message: "SYSTEM_CHASSIS_POWER_MODULE_DOWN: - - Power Module 1 down"
            }
          ]
        }
      ]
    },
    {
      section: "2.3",
      description: "Power-On Self Test (POST) passed.",
      status: "PASS",
      failures: []
    },
    {
      section: "2.4",
      description: "No active alarms.",
      status: "PASS",
      failures: []
    },
    {
      section: "3.1",
      description: "Power Module status",
      status: "FAIL",
      failures: [
        {
          message: "Only one Operational Power Supply.",
          matches: []
        },
        {
          message: "Power module 1: Not Operational.",
          matches: []
        }
      ],
      troubleshooting_context: [
        {
          description: "Cause 1 - Zippy Power Housing",
          matches: []
        }
      ]
    },
    {
      section: "3.2",
      description: "Network Acceleration Blade interface members",
      status: "PASS",
      failures: []
    },
    {
      section: "3.3",
      description: "Host Bus Adapter (HBA) Link Up",
      status: "PASS",
      failures: []
    },
    {
      section: "3.4",
      description: "Assured Delivery Blade (ADB) status",
      status: "PASS",
      failures: []
    },
    {
      section: "4.B",
      description: "Checking for NTP Server Connectivity",
      status: "PASS",
      failures: []
    },
    {
      section: "4.2",
      description: "DNS servers reachable",
      status: "PASS",
      failures: []
    },
    {
      section: "5.1",
      description: "Message spool operational",
      status: "PASS",
      failures: []
    },
    {
      section: "6.1.B.i",
      description: "Redundancy Checks",
      status: "PASS",
      failures: []
    },
    {
      section: "6.2",
      description: "Config-Sync operational status",
      status: "PASS",
      failures: []
    }
  ]
}

// Dummy data removed - HA Pairs and Replication now in Broker Context page

// ── Inline renderer for Claude analysis output ──────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  // Handle **bold** and bare URLs within a line of text
  const urlPattern = /(https?:\/\/[^\s]+)/g
  const boldPattern = /\*\*([^*]+)\*\*/g

  // Split on URLs first, then bold within non-URL segments
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const combined = /(\*\*[^*]+\*\*)|(https?:\/\/[^\s]+)/g
  let match: RegExpExecArray | null
  let key = 0

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[1]) {
      parts.push(<strong key={key++} className="font-semibold text-gray-900">{match[1].slice(2, -2)}</strong>)
    } else {
      parts.push(
        <a key={key++} href={match[2]} target="_blank" rel="noopener noreferrer"
          className="text-solace-blue hover:underline break-all">
          {match[2]}
        </a>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderAnalysis(text: string): React.ReactNode {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    // Blank line → small gap
    if (!trimmed) {
      nodes.push(<div key={i} className="h-1" />)
      return
    }

    // **ROUTER NAME** bold section header
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      nodes.push(
        <h4 key={i} className="text-base font-bold text-gray-900 mt-5 mb-1 pb-1 border-b border-gray-200">
          {trimmed.slice(2, -2)}
        </h4>
      )
      return
    }

    // --- divider
    if (/^-{3,}$/.test(trimmed)) {
      nodes.push(<hr key={i} className="border-gray-200 my-4" />)
      return
    }

    // [FAIL]
    if (trimmed.startsWith('[FAIL]')) {
      nodes.push(
        <div key={i} className="flex items-start gap-2 my-1">
          <span className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded uppercase">FAIL</span>
          <span className="text-sm text-gray-800">{renderInline(trimmed.slice(6).trim())}</span>
        </div>
      )
      return
    }

    // [WARNING]
    if (trimmed.startsWith('[WARNING]')) {
      nodes.push(
        <div key={i} className="flex items-start gap-2 my-1">
          <span className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded uppercase">WARN</span>
          <span className="text-sm text-gray-800">{renderInline(trimmed.slice(9).trim())}</span>
        </div>
      )
      return
    }

    // [INFO]
    if (trimmed.startsWith('[INFO]')) {
      nodes.push(
        <div key={i} className="flex items-start gap-2 my-1">
          <span className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded uppercase">INFO</span>
          <span className="text-sm text-gray-800">{renderInline(trimmed.slice(6).trim())}</span>
        </div>
      )
      return
    }

    // Bare URL on its own line
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      nodes.push(
        <div key={i} className="my-1">
          <a href={trimmed} target="_blank" rel="noopener noreferrer"
            className="text-sm text-solace-blue hover:underline break-all">
            {trimmed}
          </a>
        </div>
      )
      return
    }

    // KBA: Title
    if (trimmed.startsWith('KBA:')) {
      nodes.push(
        <p key={i} className="text-sm font-semibold text-gray-900 mt-4 mb-0.5">
          {trimmed.slice(4).trim()}
        </p>
      )
      return
    }

    // > **Note:** or Note: — amber callout
    if (trimmed.startsWith('> **Note:**') || trimmed.startsWith('Note:')) {
      const noteText = trimmed.replace(/^>\s*\*\*Note:\*\*\s*/, '').replace(/^Note:\s*/, '')
      nodes.push(
        <div key={i} className="my-2 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 rounded-r text-sm text-amber-900">
          <span className="font-semibold">Note: </span>{renderInline(noteText)}
        </div>
      )
      return
    }

    // Numbered list item: 1. 2. 3. …
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (numberedMatch) {
      nodes.push(
        <div key={i} className="flex gap-2 my-0.5 ml-4 text-sm text-gray-800">
          <span className="flex-shrink-0 font-medium text-gray-500 min-w-[1.25rem] text-right">{numberedMatch[1]}.</span>
          <span>{renderInline(numberedMatch[2])}</span>
        </div>
      )
      return
    }

    // Bullet: - text
    if (/^-\s+/.test(trimmed)) {
      nodes.push(
        <div key={i} className="flex gap-2 my-0.5 ml-4 text-sm text-gray-800">
          <span className="flex-shrink-0 text-gray-400 mt-0.5">•</span>
          <span>{renderInline(trimmed.slice(2).trim())}</span>
        </div>
      )
      return
    }

    // Section sub-headers: "Troubleshooting steps:", "Diagnostic check results", "Conclusion:", etc.
    if (/^[A-Z][^.!?]{0,60}:$/.test(trimmed) || trimmed === 'Diagnostic check results') {
      nodes.push(
        <p key={i} className="text-sm font-semibold text-gray-700 mt-3 mb-1">
          {trimmed}
        </p>
      )
      return
    }

    // Everything else → regular paragraph
    nodes.push(
      <p key={i} className="text-sm text-gray-800 my-1 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    )
  })

  return <>{nodes}</>
}

function ResultsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const brokersParam = searchParams.get('brokers') || searchParams.get('broker') || 'Unknown Broker'
  const selectedBrokers = brokersParam.split(',')
  const [activeBroker, setActiveBroker] = useState<string>(selectedBrokers[0])
  const [allHealthResults, setAllHealthResults] = useState<Record<string, any>>({})
  const [claudeAnalysisPerBroker, setClaudeAnalysisPerBroker] = useState<Record<string, string>>({})
  const [analysisExpanded, setAnalysisExpanded] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [chatSeededFor, setChatSeededFor] = useState<string>('')

  useEffect(() => {
    // Load analysis results from sessionStorage
    const storedResults = sessionStorage.getItem('analysisResults')
    const storedBrokers = sessionStorage.getItem('selectedBrokers')

    if (!storedResults || !storedBrokers) {
      navigate('/')
      return
    }

    if (storedResults && storedBrokers) {
      const results = JSON.parse(storedResults)
      const selected = JSON.parse(storedBrokers)

      // Store all health results
      const healthResults = results.health_results || {}
      setAllHealthResults(healthResults)

      // Load per-broker analysis text
      if (results.claude_analysis_per_broker) {
        setClaudeAnalysisPerBroker(results.claude_analysis_per_broker)
      }

      // Set first broker as active
      if (selected.length > 0) {
        setActiveBroker(selected[0])
      }
    }
  }, [navigate])

  // Collapse analysis card when switching broker tabs
  useEffect(() => {
    setAnalysisExpanded(false)
  }, [activeBroker])

  // Get current broker's health results
  const currentHealthResults = allHealthResults[activeBroker] || dummyHealthCheckResults
  const failedChecks = currentHealthResults.results?.filter((r: any) => r.status === 'FAIL') || []
  const warningChecks = currentHealthResults.results?.filter((r: any) => r.status === 'WARNING') || []

  // Per-broker analysis text (empty string = healthy broker, show nothing)
  const claudeAnalysis = claudeAnalysisPerBroker[activeBroker] || ''

  const handleBack = () => {
    navigate('/broker-context')
  }

  const handleNewAnalysis = () => {
    sessionStorage.clear()
    navigate('/')
  }

  const handleOpenChat = () => {
    // Reseed whenever the active broker has changed since last seed
    if (chatSeededFor !== activeBroker) {
      const failList = failedChecks
        .map((f: any) => `Section ${f.section}: ${f.description}`)
        .join('; ')
      const seeds: Message[] = [
        {
          role: 'user',
          content: `Health check analysis for ${activeBroker}${failList ? ` — ${failList}` : ''}`,
          timestamp: new Date()
        }
      ]
      if (claudeAnalysis) {
        seeds.push({ role: 'assistant', content: claudeAnalysis, timestamp: new Date() })
      }
      setChatMessages(seeds)
      setChatSeededFor(activeBroker)
    }
    setChatOpen(true)
  }

  const handleToggleChat = () => {
    if (chatOpen) {
      setChatOpen(false)
    } else {
      handleOpenChat()
    }
  }

  return (
    <div className="min-h-screen bg-solace-gray-light">
      {/* Header */}
      <header className="bg-solace-dark text-white py-4 shadow-lg border-b-4 border-solace-green">
        <div className="container mx-auto px-6">
          <h1 className="text-2xl font-bold">Solace Broker Diagnostics</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800">Solace Health Check Analyzer</h2>
            <p className="text-gray-600 mt-2">
              Health check results for {selectedBrokers.length} broker{selectedBrokers.length > 1 ? 's' : ''}
            </p>
          </div>

          <StepIndicator currentStep={3} />

          {/* Navigation Buttons */}
          <div className="mb-6 flex justify-between items-center">
            <button
              onClick={handleBack}
              className="text-solace-blue hover:text-solace-blue-dark font-semibold flex items-center space-x-2 transition-colors"
            >
              <span>←</span>
              <span>Back to Broker Selection</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleChat}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold border-2 transition-colors shadow-sm ${
                  chatOpen
                    ? 'bg-solace-green text-white border-solace-green'
                    : 'bg-white text-solace-green border-solace-green hover:bg-solace-green-50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Ask Claude
              </button>
              <button
                onClick={handleNewAnalysis}
                className="bg-solace-green text-white px-6 py-2 rounded-lg font-semibold hover:bg-solace-green-dark transition-colors shadow-md"
              >
                New Analysis
              </button>
            </div>
          </div>


          {/* Broker Tabs */}
          <div className="bg-white rounded-t-lg shadow-lg">
            <div className="flex border-b border-gray-200 overflow-x-auto">
              {selectedBrokers.map((broker) => (
                <button
                  key={broker}
                  onClick={() => setActiveBroker(broker)}
                  className={`px-6 py-4 font-semibold text-sm whitespace-nowrap transition-all ${
                    activeBroker === broker
                      ? 'border-b-2 border-solace-green text-solace-green bg-solace-green-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {broker}
                </button>
              ))}
            </div>
          </div>

          {/* Health Check Results */}
          <div className="bg-white rounded-b-lg shadow-lg p-6">
            {/* Overall Status for Current Broker */}
            <div className={`rounded-lg p-6 mb-6 ${
              currentHealthResults.overall === 'PASS'
                ? 'bg-solace-green-50 border-2 border-solace-green'
                : 'bg-solace-red-50 border-2 border-solace-red'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {activeBroker} - Health Status:
                    <span className={`ml-3 ${
                      currentHealthResults.overall === 'PASS' ? 'text-solace-green' : 'text-solace-red'
                    }`}>
                      {currentHealthResults.overall}
                    </span>
                  </h2>
                  <p className="text-gray-600">Reference Date: {currentHealthResults.reference_date}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Summary</div>
                  {warningChecks.length > 0 && (
                    <div className="text-3xl font-bold text-yellow-600">{warningChecks.length} Warning{warningChecks.length > 1 ? 's' : ''}</div>
                  )}
                  <div className="text-3xl font-bold text-solace-red">{failedChecks.length} Failed</div>
                </div>
              </div>
            </div>

            {/* Claude Fail Analysis — Confluence Rovo-style AI answer */}
            {claudeAnalysis && (
              <div className="mb-6">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-solace-green flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l1.09 6.26L19 6l-4.26 4.91L21 12l-6.17 1.09L19 18l-6.91-2.26L12 22l-2.09-1.74L3 18l4.26-4.91L2 12l6.17-1.09L3 6l6.26 2.26z"/>
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-800">Claude's Fail Analysis</h3>
                </div>

                {/* Card */}
                <div className="bg-solace-green-50 border border-solace-green-200 rounded-lg p-5">
                  {/* Content with clamp when collapsed */}
                  <div className="relative">
                    <div className={analysisExpanded ? '' : 'max-h-28 overflow-hidden'}>
                      {renderAnalysis(claudeAnalysis)}
                    </div>
                    {/* Gradient fade */}
                    {!analysisExpanded && (
                      <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-solace-green-50 to-transparent pointer-events-none" />
                    )}
                  </div>

                  {/* Read More / Show Less */}
                  <button
                    onClick={() => setAnalysisExpanded(prev => !prev)}
                    className="mt-3 text-solace-blue font-semibold text-sm hover:underline"
                  >
                    {analysisExpanded ? 'Show less' : 'Read more'}
                  </button>

                  {/* Footer row — AI disclaimer + Open chat */}
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Uses AI. Verify results.</span>
                    </div>
                    {analysisExpanded && (
                      <button
                        onClick={handleOpenChat}
                        className="flex items-center gap-1.5 text-xs font-semibold text-solace-green hover:text-solace-green-dark transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Open chat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Failed Checks Section */}
            {failedChecks.length > 0 && (
              <div className="space-y-4 mb-8">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 bg-solace-red rounded-full"></span>
                  Failed Health Checks ({failedChecks.length})
                </h3>
                {failedChecks.map((result: any) => (
                <div
                  key={result.section}
                  className={`border-2 rounded-lg p-4 ${
                    result.status === 'PASS'
                      ? 'border-solace-green-200 bg-solace-green-50'
                      : 'border-solace-red-200 bg-solace-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div>
                        <h3 className="font-bold text-gray-800">
                          Section {result.section}: {result.description}
                        </h3>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      result.status === 'PASS'
                        ? 'bg-solace-green text-white'
                        : 'bg-solace-red text-white'
                    }`}>
                      {result.status}
                    </span>
                  </div>

                  {/* Failures */}
                  {result.failures && result.failures.length > 0 && (
                    <div className="mt-3 ml-11 space-y-2">
                      {result.failures.map((failure: any, fIdx: number) => (
                        <div key={fIdx} className="bg-white rounded p-3 border border-red-300">
                          <p className="text-red-700 font-medium mb-2">{failure.message}</p>
                          {failure.matches && failure.matches.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {failure.matches.map((match: any, mIdx: number) => (
                                <div key={mIdx} className="text-sm">
                                  <div className="text-gray-600">
                                    <span className="font-semibold">Source:</span> {match.source}
                                  </div>
                                  <div className="text-gray-600">
                                    <span className="font-semibold">Time:</span> {match.timestamp}
                                  </div>
                                  <div className="text-gray-700 bg-gray-100 p-2 rounded mt-1 font-mono text-xs">
                                    {match.line}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Troubleshooting Context */}
                      {(result as any).troubleshooting_context && (result as any).troubleshooting_context.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mt-2">
                          {(result as any).troubleshooting_context.map((ctx: any, cIdx: number) => (
                            <p key={cIdx} className="text-yellow-700 text-sm">
                              <span className="font-semibold">Likely Cause: </span>
                              {ctx.description.replace(/^Cause\s+\d+\s*[-–]\s*/i, '')}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              </div>
            )}

            {/* Warning Checks Section */}
            {warningChecks.length > 0 && (
              <div className="space-y-4 mb-8">
                <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full"></span>
                  Warning Health Checks ({warningChecks.length})
                </h3>
                {warningChecks.map((result: any) => (
                <div
                  key={result.section}
                  className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div>
                        <h3 className="font-bold text-gray-800">
                          Section {result.section}: {result.description}
                        </h3>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-500 text-white">
                      WARNING
                    </span>
                  </div>

                  {/* Warning Messages */}
                  {result.failures && result.failures.length > 0 && (
                    <div className="mt-3 ml-11 space-y-2">
                      {result.failures.map((failure: any, fIdx: number) => (
                        <div key={fIdx} className="bg-white rounded p-3 border border-yellow-400">
                          <p className="text-yellow-700 font-medium">{failure.message}</p>
                          {failure.matches && failure.matches.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {failure.matches.map((match: any, mIdx: number) => (
                                <div key={mIdx} className="text-sm">
                                  <div className="text-gray-600">
                                    <span className="font-semibold">Source:</span> {match.source}
                                  </div>
                                  <div className="text-gray-600">
                                    <span className="font-semibold">Time:</span> {match.timestamp}
                                  </div>
                                  <div className="text-gray-700 bg-gray-100 p-2 rounded mt-1 font-mono text-xs">
                                    {match.line}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              </div>
            )}

            {/* Success Message */}
            {failedChecks.length === 0 && warningChecks.length === 0 && (
              <div className="text-center py-12 text-solace-green">
                <p className="text-xl font-semibold">All health checks passed!</p>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-solace-dark-darker text-white text-center p-6 mt-12 border-t-2 border-solace-green" />

      {/* Slide-in Chat Panel */}
      {/* Backdrop */}
      {chatOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setChatOpen(false)}
        />
      )}
      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 w-[440px] max-w-full z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          chatOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <Chatbot
          panel
          context={{ broker: activeBroker, healthResults: currentHealthResults }}
          initialMessages={chatMessages}
          onClose={() => setChatOpen(false)}
          contextKey={activeBroker}
        />
      </div>
    </div>
  )
}

export default ResultsPage
