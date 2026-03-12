interface IndividualHealthChecksProps {
  healthSummary: any
}

export default function IndividualHealthChecks({ healthSummary }: IndividualHealthChecksProps) {
  if (!healthSummary || !healthSummary.broker_health) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-6">🏥 Individual Broker Health Checks</h2>

      {Object.entries(healthSummary.broker_health).map(([brokerName, health]: [string, any]) => {
        const statusIcon = health.failed > 0 ? '❌' : health.warnings > 0 ? '⚠️' : '✅'
        const statusText = health.failed > 0 ? 'CRITICAL' : health.warnings > 0 ? 'DEGRADED' : 'HEALTHY'
        const statusColor = health.failed > 0 ? 'red' : health.warnings > 0 ? 'yellow' : 'green'
        const bgColor = health.failed > 0 ? 'bg-red-50' : health.warnings > 0 ? 'bg-yellow-50' : 'bg-green-50'
        const borderColor = health.failed > 0 ? 'border-red-500' : health.warnings > 0 ? 'border-yellow-500' : 'border-green-500'

        return (
          <div key={brokerName} className={`${bgColor} border-l-4 ${borderColor} p-6 rounded-r-lg mb-6`}>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                <span>📍</span>
                <span>BROKER: {brokerName}</span>
              </h3>
              <div className="mt-2 flex items-center space-x-4">
                <span className="text-2xl">{statusIcon}</span>
                <span className={`font-bold text-lg text-${statusColor}-700`}>{statusText}</span>
              </div>
              <div className="mt-2 text-sm text-gray-700">
                Total Checks: <strong>{health.total}</strong> |
                <span className="text-green-600 ml-2">✅ Passed: {health.passed}</span> |
                <span className="text-yellow-600 ml-2">⚠️ Warnings: {health.warnings}</span> |
                <span className="text-red-600 ml-2">❌ Failed: {health.failed}</span>
              </div>
            </div>

            {/* All Checks Listed */}
            <div className="space-y-2 mt-4">
              {health.checks?.map((check: any, idx: number) => {
                const checkIcon = check.status === 'PASSED' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌'

                return (
                  <div key={idx} className="flex items-start space-x-2 text-sm">
                    <span className="text-lg flex-shrink-0">{checkIcon}</span>
                    <div className="flex-1">
                      <span className="font-semibold">{check.name}:</span>
                      <span className="text-gray-700 ml-2">{check.message}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
