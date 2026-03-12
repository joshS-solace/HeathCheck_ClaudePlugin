interface EventProblemsProps {
  problems: any
}

export default function EventProblems({ problems }: EventProblemsProps) {
  if (!problems) return null

  // Check if there are any actual problems
  let hasProblems = false
  for (const brokerProblems of Object.values(problems)) {
    const p: any = brokerProblems
    const total = (p.critical?.length || 0) + (p.high?.length || 0) +
                  (p.storage_issues?.length || 0) + (p.ha_issues?.length || 0) +
                  (p.spool_issues?.length || 0) + (p.client_issues?.length || 0)
    if (total > 0) {
      hasProblems = true
      break
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-6">🔍 Detected Problems (From Event Logs)</h2>

      {hasProblems ? (
        <div className="space-y-4">
          {Object.entries(problems).map(([brokerName, brokerProblems]: [string, any]) => {
            const critical = brokerProblems.critical?.length || 0
            const high = brokerProblems.high?.length || 0
            const storage = brokerProblems.storage_issues?.length || 0
            const ha = brokerProblems.ha_issues?.length || 0
            const spool = brokerProblems.spool_issues?.length || 0
            const client = brokerProblems.client_issues?.length || 0

            const total = critical + high + storage + ha + spool + client

            if (total === 0) return null

            return (
              <div key={brokerName} className="border-l-4 border-red-500 bg-red-50 p-4 rounded-r-lg">
                <h3 className="font-bold text-red-900 mb-2">📍 Router: {brokerName}</h3>
                <div className="ml-4 space-y-1 text-sm">
                  {critical > 0 && <div className="text-red-700">🔴 Critical Issues: {critical}</div>}
                  {high > 0 && <div className="text-orange-600">🟠 High Severity: {high}</div>}
                  {storage > 0 && <div className="text-purple-600">💾 Storage Issues: {storage}</div>}
                  {ha > 0 && <div className="text-blue-600">🔄 HA Issues: {ha}</div>}
                  {spool > 0 && <div className="text-yellow-600">📦 Spool Issues: {spool}</div>}
                  {client > 0 && <div className="text-gray-600">👥 Client Issues: {client}</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg">
          <h3 className="font-bold text-green-900 mb-2">✅ NO EVENT-BASED PROBLEMS DETECTED</h3>
          <p className="text-green-800 text-sm">Good news! No error or warning events found in logs.</p>
          <p className="text-green-700 text-xs mt-1">(Health check warnings above are from current state analysis)</p>
        </div>
      )}
    </div>
  )
}
