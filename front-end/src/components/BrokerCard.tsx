import { useState } from 'react'

interface BrokerCardProps {
  brokerName: string
  health: any
}

export default function BrokerCard({ brokerName, health }: BrokerCardProps) {
  const [expanded, setExpanded] = useState(false)

  const { passed, warnings, failed, total, checks } = health

  const healthScore = total > 0 ? Math.round((passed / total) * 100) : 0

  const statusIcon = failed > 0 ? '❌' : warnings > 0 ? '⚠️' : '✅'
  const statusText = failed > 0 ? 'CRITICAL' : warnings > 0 ? 'DEGRADED' : 'HEALTHY'
  const statusColor = failed > 0 ? 'red' : warnings > 0 ? 'yellow' : 'green'

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 border-l-4 border-${statusColor}-500`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">📍 {brokerName}</h3>
        <span className={`text-2xl`}>{statusIcon}</span>
      </div>

      {/* Status */}
      <div className={`text-${statusColor}-600 font-semibold mb-2`}>
        {statusText}
      </div>

      {/* Health Score */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Health Score</span>
          <span className="font-bold">{healthScore}/100</span>
        </div>
        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full bg-${statusColor}-500`}
            style={{ width: `${healthScore}%` }}
          ></div>
        </div>
      </div>

      {/* Check Summary */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
        <div>
          <div className="text-green-600 font-bold">✅ {passed}</div>
          <div className="text-gray-500 text-xs">Passed</div>
        </div>
        <div>
          <div className="text-yellow-600 font-bold">⚠️  {warnings}</div>
          <div className="text-gray-500 text-xs">Warnings</div>
        </div>
        <div>
          <div className="text-red-600 font-bold">❌ {failed}</div>
          <div className="text-gray-500 text-xs">Failed</div>
        </div>
      </div>

      {/* Toggle Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-blue-600 hover:text-blue-800 text-sm font-semibold"
      >
        {expanded ? '▲ Hide Details' : '▼ View Details'}
      </button>

      {/* Expanded Checks */}
      {expanded && (
        <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
          {checks?.map((check: any, idx: number) => (
            <div
              key={idx}
              className={`p-3 rounded ${
                check.status === 'PASSED' ? 'bg-green-50' :
                check.status === 'WARNING' ? 'bg-yellow-50' : 'bg-red-50'
              }`}
            >
              <div className="flex items-start space-x-2">
                <span className="text-lg">
                  {check.status === 'PASSED' ? '✅' :
                   check.status === 'WARNING' ? '⚠️' : '❌'}
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{check.name}</div>
                  <div className="text-xs text-gray-600">{check.message}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
