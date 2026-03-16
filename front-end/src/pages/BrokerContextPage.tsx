import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from '../components/StepIndicator'
import { pluginAnalyze } from '../services/api'

type TabType = 'broker-selection' | 'replication' | 'ha-pairs'

function BrokerContextPage() {
  const navigate = useNavigate()
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([])
  const [brokers, setBrokers] = useState<any[]>([])
  const [haPairs, setHaPairs] = useState<any[]>([])
  const [replicationPairs, setReplicationPairs] = useState<any[]>([])
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<TabType>('broker-selection')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    const storedResults = sessionStorage.getItem('analysisResults')
    if (storedResults) {
      const results = JSON.parse(storedResults)
      setAnalysisData(results)
      setBrokers(results.router_contexts || [])
      setHaPairs(results.ha_pairs || [])
      setReplicationPairs(results.replication_pairs || [])
    } else {
      navigate('/')
    }
  }, [navigate])

  // Look up redundancy_mode for an HA pair from router_contexts
  const getPairMode = (pair: any): string => {
    const found = pair.brokers.find((b: any) => !b.missing_gd)
    if (!found) return ''
    const ctx = brokers.find((b: any) => b.router_name === found.router_name)
    return ctx?.redundancy_mode || ''
  }

  // Determine the position label for a broker in an HA pair
  const getRoleLabel = (brokerRole: string, pairMode: string): string => {
    if (pairMode === 'Active/Active') return brokerRole  // e.g. "Active", "Mate"
    if (brokerRole.includes('Primary')) return 'PRIMARY'
    if (brokerRole === 'Mate') return 'MATE'
    return 'BACKUP'
  }

  const handleSelectBroker = (routerName: string) => {
    setSelectedBrokers(prev =>
      prev.includes(routerName) ? prev.filter(n => n !== routerName) : [...prev, routerName]
    )
  }

  const handleSelectAll = () => {
    setSelectedBrokers(selectedBrokers.length === brokers.length ? [] : brokers.map(b => b.router_name))
  }

  const handleProceed = async () => {
    if (selectedBrokers.length === 0) return
    setIsAnalyzing(true)
    try {
      const currentResults = JSON.parse(sessionStorage.getItem('analysisResults') || '{}')

      // Analyze one broker at a time so each gets its own Claude AI response
      for (const broker of selectedBrokers) {
        const existingAnalysis = (currentResults.claude_analysis_per_broker || {})[broker]
        if (existingAnalysis) continue  // already has AI analysis, skip

        const analyzeResult = await pluginAnalyze([broker])

        // Merge JSON health results
        currentResults.health_results = {
          ...(currentResults.health_results || {}),
          ...(analyzeResult.plugin_health_results || {})
        }

        // Store Claude's AI output per broker (KBAs, troubleshooting steps, etc.)
        const aiText: string = (analyzeResult.output || '').trim()
        if (aiText) {
          currentResults.claude_analysis_per_broker = {
            ...(currentResults.claude_analysis_per_broker || {}),
            [broker]: aiText
          }
        }

        // Persist after each broker so partial results survive an error mid-loop
        sessionStorage.setItem('analysisResults', JSON.stringify(currentResults))
      }

      sessionStorage.setItem('selectedBrokers', JSON.stringify(selectedBrokers))
      navigate(`/results?brokers=${selectedBrokers.join(',')}`)
    } catch (error: any) {
      console.error('Health check analysis failed:', error)
      alert(`Health check failed: ${error.message}\n\nMake sure the backend server is running.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-solace-gray-light">
      <header className="bg-solace-dark text-white py-4 shadow-lg border-b-4 border-solace-green">
        <div className="container mx-auto px-6">
          <h1 className="text-2xl font-bold">Solace Broker Diagnostics</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800">Solace Health Check Analyzer</h2>
            <p className="text-gray-600 mt-2">Review broker context and validate configurations</p>
          </div>

          <StepIndicator currentStep={2} />

          <div className="mb-6">
            <button
              onClick={() => navigate('/')}
              className="text-solace-blue hover:text-solace-blue-dark font-semibold flex items-center space-x-2 transition-colors"
            >
              <span>←</span>
              <span>Back to Upload</span>
            </button>
          </div>

          {/* Tabs — Broker Selection | Replication Pairs | HA Pairs */}
          <div className="bg-white rounded-t-lg shadow-lg">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('broker-selection')}
                className={`px-6 py-4 font-semibold text-sm transition-all ${
                  activeTab === 'broker-selection'
                    ? 'border-b-2 border-solace-green text-solace-green bg-solace-green-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Broker Selection ({brokers.length})
              </button>
              <button
                onClick={() => setActiveTab('replication')}
                className={`px-6 py-4 font-semibold text-sm transition-all ${
                  activeTab === 'replication'
                    ? 'border-b-2 border-solace-blue text-solace-blue bg-solace-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Replication Pairs ({replicationPairs.length})
              </button>
              <button
                onClick={() => setActiveTab('ha-pairs')}
                className={`px-6 py-4 font-semibold text-sm transition-all ${
                  activeTab === 'ha-pairs'
                    ? 'border-b-2 border-solace-green text-solace-green bg-solace-green-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                HA Pairs ({haPairs.length})
              </button>
            </div>
          </div>

          <div className="bg-white rounded-b-lg shadow-lg p-8">

            {/* ── Broker Selection Tab ── */}
            {activeTab === 'broker-selection' && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Broker Context</h2>
                    <p className="text-gray-600 mt-2">Select broker(s) to perform health check analysis</p>
                    <p className="text-sm text-solace-blue mt-1">Select multiple brokers for HA redundancy and replication checks</p>
                  </div>
                  <button
                    onClick={handleSelectAll}
                    className="px-4 py-2 border-2 border-solace-green text-solace-green rounded-lg font-semibold hover:bg-solace-green-50 transition-colors"
                  >
                    {selectedBrokers.length === brokers.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {selectedBrokers.length > 0 && (
                  <div className="mb-4 p-3 bg-solace-blue-50 border border-solace-blue-200 rounded-lg">
                    <p className="text-solace-blue-800 font-semibold">
                      {selectedBrokers.length} broker{selectedBrokers.length > 1 ? 's' : ''} selected: {selectedBrokers.join(', ')}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 items-stretch">
                  {brokers.map((broker) => (
                    <div
                      key={broker.router_name}
                      onClick={() => handleSelectBroker(broker.router_name)}
                      className={`border-2 rounded-lg p-5 cursor-pointer transition-all h-full flex flex-col ${
                        selectedBrokers.includes(broker.router_name)
                          ? 'border-solace-green bg-solace-green-50 shadow-lg scale-105'
                          : 'border-gray-200 hover:border-solace-green-300 hover:shadow-md'
                      }`}
                    >
                      <h3 className="text-lg font-bold text-gray-800 mb-3">{broker.router_name}</h3>

                      <div className="flex gap-3 text-sm flex-1">

                        {/* ── Left column: hardware + operational status ── */}
                        <div className="flex-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 content-start">
                          <span className="text-gray-500">Serial:</span>
                          <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.serial || 'N/A'}</span>

                          {broker.chassis_product && (<>
                            <span className="text-gray-500">Chassis:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.chassis_product}</span>
                          </>)}

                          {broker.solos_version && (<>
                            <span className="text-gray-500">SolOS:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.solos_version}</span>
                          </>)}

                          {broker.spool_config && (<>
                            <span className="text-gray-500">Message Spool:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.spool_config}{broker.spool_oper ? ` / ${broker.spool_oper}` : ''}</span>
                          </>)}

                          {broker.redun_config && (<>
                            <span className="text-gray-500">Redundancy:</span>
                            <span className={`font-semibold min-w-0 break-words ${broker.redun_status === 'Up' ? 'text-green-600' : 'text-red-600'}`}>
                              {broker.redun_config}{broker.redun_status ? ` / ${broker.redun_status}` : ''}
                            </span>
                          </>)}

                          {broker.csync_config && (<>
                            <span className="text-gray-500">Config Sync:</span>
                            <span className={`font-semibold min-w-0 break-words ${broker.csync_oper === 'Up' ? 'text-green-600' : 'text-red-600'}`}>
                              {broker.csync_config}{broker.csync_oper ? ` / ${broker.csync_oper}` : ''}
                            </span>
                          </>)}
                        </div>

                        {/* ── Right column: redundancy + replication topology ── */}
                        <div className="flex-1 border-l border-gray-200 pl-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 content-start">
                          {broker.redun_status === 'Up' && (<>
                            <span className="text-gray-500">Redundancy Mode:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.redundancy_mode || 'N/A'}</span>

                            <span className="text-gray-500">Redundancy Role:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.redundancy_role ? `AD-${broker.redundancy_role}` : 'N/A'}</span>

                            <span className="text-gray-500">A/S Role:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.active_standby_role || 'N/A'}</span>
                          </>)}

                          {broker.mate_router && (<>
                            <span className="text-gray-500">Mate Router:</span>
                            <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.mate_router}</span>
                          </>)}

                          {broker.replication_status && (<>
                            {(broker.redun_status === 'Up' || broker.mate_router) && (
                              <div className="col-span-2 border-t border-gray-200 my-0.5" />
                            )}
                            <span className="text-gray-500">Replication:</span>
                            <span className={`font-semibold min-w-0 break-words ${
                              broker.replication_status === 'Enabled / Up' ? 'text-green-600' :
                              broker.replication_status === 'N/A' ? 'text-gray-500' :
                              'text-red-600'
                            }`}>{broker.replication_status}</span>

                            {broker.replication_active && broker.replication_mate && (<>
                              <span className="text-gray-500">Repl. Mate:</span>
                              <span className="font-semibold text-gray-800 min-w-0 break-words">{broker.replication_mate}</span>
                            </>)}

                            {broker.replication_active && broker.replication_site && (<>
                              <span className="text-gray-500">Repl. Site:</span>
                              <span className={`font-semibold min-w-0 break-words ${broker.replication_site.toLowerCase().includes('down') ? 'text-red-600' : 'text-green-600'}`}>
                                {broker.replication_site}
                              </span>
                            </>)}
                          </>)}
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

                {selectedBrokers.length > 0 && (
                  <div className="text-center">
                    <button
                      onClick={handleProceed}
                      disabled={isAnalyzing}
                      className="bg-solace-green text-white px-8 py-3 rounded-lg font-semibold hover:bg-solace-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                    >
                      {isAnalyzing ? (
                        <span className="flex items-center space-x-2 justify-center">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Running Health Checks...</span>
                        </span>
                      ) : (
                        `Proceed to Health Check Results (${selectedBrokers.length} broker${selectedBrokers.length > 1 ? 's' : ''}) →`
                      )}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Replication Pairs Tab ── */}
            {activeTab === 'replication' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Replication Pair Validation</h3>
                {replicationPairs.map((repPair: any) => {
                  const activeSite: any[] = repPair.active_site || []
                  const standbySite: any[] = repPair.standby_site || []
                  const allBrokers = [...activeSite, ...standbySite]
                  const hasIssues = allBrokers.some((b: any) => b.missing_gd)
                  return (
                    <div key={repPair.pair_number} className={`border-2 rounded-lg p-6 shadow-md ${
                      hasIssues ? 'border-solace-yellow bg-solace-yellow/10' : 'border-solace-green-200 bg-solace-green-50'
                    }`}>
                      <div className="flex items-start justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-800">
                          Replication Pair {repPair.pair_number}
                        </h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          hasIssues ? 'bg-solace-yellow text-white' : 'bg-solace-green text-white'
                        }`}>
                          {hasIssues ? 'INCOMPLETE' : 'COMPLETE'}
                        </span>
                      </div>

                      <div className="mb-4">
                        <h5 className="font-semibold text-gray-700 mb-3">
                          Active Site ({activeSite.length} broker{activeSite.length !== 1 ? 's' : ''})
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeSite.map((broker: any, idx: number) => (
                            <div key={idx} className={`rounded-lg p-4 border-2 ${
                              hasIssues ? 'bg-white border-gray-300' : 'bg-solace-green-100 border-solace-green-400'
                            }`}>
                              <p className={`text-xs font-semibold mb-1 uppercase ${
                                hasIssues ? 'text-gray-600' : 'text-solace-green-800'
                              }`}>
                                Active Site
                              </p>
                              <p className="font-bold text-gray-800">{broker.router_name}</p>
                              {broker.role && <p className="text-sm text-gray-600 mt-1">{broker.role}</p>}
                              {broker.missing_gd && (
                                <div className="mt-3 bg-solace-red-100 border border-solace-red-300 rounded p-2">
                                  <p className="text-solace-red-700 text-xs font-semibold">Gather Diagnostics Missing</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-700 mb-3">
                          Standby Site ({standbySite.length} broker{standbySite.length !== 1 ? 's' : ''})
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {standbySite.map((broker: any, idx: number) => (
                            <div key={idx} className={`rounded-lg p-4 border-2 ${
                              hasIssues ? 'bg-white border-gray-300' : 'bg-solace-green-100 border-solace-green-400'
                            }`}>
                              <p className={`text-xs font-semibold mb-1 uppercase ${
                                hasIssues ? 'text-gray-600' : 'text-solace-green-800'
                              }`}>
                                Standby Site
                              </p>
                              <p className="font-bold text-gray-800">{broker.router_name}</p>
                              {broker.role && <p className="text-sm text-gray-600 mt-1">{broker.role}</p>}
                              {broker.missing_gd && (
                                <div className="mt-3 bg-solace-red-100 border border-solace-red-300 rounded p-2">
                                  <p className="text-solace-red-700 text-xs font-semibold">Gather Diagnostics Missing</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {replicationPairs.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-xl">No replication pairs configured</p>
                  </div>
                )}
              </div>
            )}

            {/* ── HA Pairs Tab ── */}
            {activeTab === 'ha-pairs' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">HA Pair Validation</h3>
                {haPairs.map((pair: any) => {
                  const hasIssues = pair.brokers.some((b: any) => b.missing_gd)
                  const pairMode = getPairMode(pair)
                  return (
                    <div key={pair.pair_number} className={`border-2 rounded-lg p-6 shadow-md ${
                      hasIssues ? 'border-solace-yellow bg-solace-yellow/10' : 'border-solace-green-200 bg-solace-green-50'
                    }`}>
                      <div className="flex items-start justify-between mb-4">
                        <h4 className="text-lg font-bold text-gray-800">
                          HA Pair {pair.pair_number}{pairMode ? ` — ${pairMode}` : ''}
                        </h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          hasIssues ? 'bg-solace-yellow text-white' : 'bg-solace-green text-white'
                        }`}>
                          {hasIssues ? 'INCOMPLETE' : 'COMPLETE'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pair.brokers.map((broker: any, idx: number) => {
                          const roleLabel = getRoleLabel(broker.role, pairMode)
                          return (
                            <div
                              key={idx}
                              className={`rounded-lg p-4 border-2 ${
                                hasIssues ? 'bg-white border-gray-300' : 'bg-solace-green-100 border-solace-green-400'
                              }`}
                            >
                              <p className={`text-xs font-semibold mb-1 uppercase ${
                                hasIssues ? 'text-gray-600' : 'text-solace-green-800'
                              }`}>
                                {roleLabel}
                              </p>
                              <p className="font-bold text-gray-800">{broker.router_name}</p>
                              <p className="text-sm text-gray-600 mt-1">{broker.role}</p>
                              {broker.missing_gd && (
                                <div className="mt-3 bg-solace-red-100 border border-solace-red-300 rounded p-2">
                                  <p className="text-solace-red-700 text-xs font-semibold">Gather Diagnostics Missing</p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {haPairs.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-xl">No HA pairs configured</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </main>

      <footer className="bg-solace-dark-darker text-white text-center p-6 mt-12 border-t-2 border-solace-green" />
    </div>
  )
}

export default BrokerContextPage
