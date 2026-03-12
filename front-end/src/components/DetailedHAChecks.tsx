interface DetailedHAChecksProps {
  haAnalysis: any
}

export default function DetailedHAChecks({ haAnalysis }: DetailedHAChecksProps) {
  if (!haAnalysis) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-6">🔄 Detailed HA Pair Health Checks</h2>

      <div className="bg-solace-lightBlue/50 p-4 rounded-lg mb-4">
        <div className="text-lg mb-2">
          <strong>Pair:</strong> <span className="font-mono">{haAnalysis.broker1} ⇄ {haAnalysis.broker2}</span>
        </div>
        <div className="text-sm">
          <strong>HA-Specific Checks:</strong> {haAnalysis.passed + haAnalysis.warnings + haAnalysis.failed}
          <span className="ml-4 text-green-600">✅ {haAnalysis.passed} Passed</span>
          <span className="ml-2 text-yellow-600">⚠️ {haAnalysis.warnings} Warnings</span>
          <span className="ml-2 text-red-600">❌ {haAnalysis.failed} Failed</span>
        </div>
      </div>

      {/* Individual HA Checks */}
      <div className="space-y-3">
        {haAnalysis.checks?.map((check: any, idx: number) => {
          const icon = check.status === 'PASSED' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌'
          const bgColor = check.status === 'PASSED' ? 'bg-green-50' : check.status === 'WARNING' ? 'bg-yellow-50' : 'bg-red-50'
          const borderColor = check.status === 'PASSED' ? 'border-green-500' : check.status === 'WARNING' ? 'border-yellow-500' : 'border-red-500'

          return (
            <div key={idx} className={`${bgColor} border-l-4 ${borderColor} p-4 rounded-r-lg`}>
              <div className="flex items-start space-x-3">
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div>
                  <div className="font-bold text-gray-900">{check.name}</div>
                  <div className="text-sm text-gray-700 mt-1">{check.message}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
