import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import BrokerCard from './BrokerCard'

interface HealthDashboardProps {
  healthSummary: any
  haAnalysis: any
}

export default function HealthDashboard({ healthSummary, haAnalysis }: HealthDashboardProps) {
  if (!healthSummary) return null

  const { overall_passed, overall_warnings, overall_failed, broker_health } = healthSummary

  const total = overall_passed + overall_warnings + overall_failed
  const healthScore = total > 0 ? Math.round((overall_passed / total) * 100) : 0

  // Data for chart
  const chartData = [
    { name: 'Passed', value: overall_passed, fill: '#10b981' },
    { name: 'Warnings', value: overall_warnings, fill: '#f59e0b' },
    { name: 'Failed', value: overall_failed, fill: '#ef4444' }
  ]

  // Health score color
  const scoreColor =
    healthScore >= 80 ? 'text-green-600' :
    healthScore >= 60 ? 'text-yellow-600' : 'text-red-600'

  const scoreBgColor =
    healthScore >= 80 ? 'bg-green-100' :
    healthScore >= 60 ? 'bg-yellow-100' : 'bg-red-100'

  return (
    <div className="space-y-6">
      {/* Overall Health Score */}
      <div className={`${scoreBgColor} rounded-lg p-6`}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            📊 Overall Health Score
          </h2>
          <div className={`text-6xl font-bold ${scoreColor}`}>
            {healthScore}/100
          </div>

          {/* Progress Bar */}
          <div className="mt-4 bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full ${healthScore >= 80 ? 'bg-green-500' : healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${healthScore}%` }}
            ></div>
          </div>

          {/* Stats */}
          <div className="mt-6 flex justify-center space-x-8">
            <div>
              <div className="text-3xl font-bold text-green-600">✅ {overall_passed}</div>
              <div className="text-sm text-gray-600">Passed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-600">⚠️  {overall_warnings}</div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">❌ {overall_failed}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold mb-4">Health Check Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Individual Broker Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {broker_health && Object.entries(broker_health).map(([brokerName, health]: [string, any]) => (
          <BrokerCard key={brokerName} brokerName={brokerName} health={health} />
        ))}
      </div>

      {/* HA Analysis */}
      {haAnalysis && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4">🔄 HA Pair Validation</h3>
          <div className="space-y-2">
            <p className="text-gray-700">
              <strong>Pair:</strong> {haAnalysis.broker1} ⇄ {haAnalysis.broker2}
            </p>
            <p className="text-gray-700">
              <strong>Checks:</strong>{' '}
              <span className="text-green-600">✅ {haAnalysis.passed}</span>{' '}
              <span className="text-yellow-600">⚠️  {haAnalysis.warnings}</span>{' '}
              <span className="text-red-600">❌ {haAnalysis.failed}</span>
            </p>

            <div className="mt-4 space-y-2">
              {haAnalysis.checks?.map((check: any, idx: number) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="mt-1">
                    {check.status === 'PASSED' ? '✅' :
                     check.status === 'WARNING' ? '⚠️' : '❌'}
                  </span>
                  <div>
                    <strong>{check.name}</strong>
                    <p className="text-sm text-gray-600">{check.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
