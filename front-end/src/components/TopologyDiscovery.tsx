interface TopologyDiscoveryProps {
  topology: any
  analysisMode: string
}

export default function TopologyDiscovery({ topology, analysisMode }: TopologyDiscoveryProps) {
  if (!topology) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-4">🗺️ Topology Discovery</h2>

      <div className="text-lg mb-6">
        <span className="font-semibold">Brokers Analyzed: </span>
        <span className="text-solace-blue font-bold">{topology.broker_count || 0}</span>
      </div>

      {/* HA Pair */}
      {topology.is_ha_pair && topology.ha_relationship?.is_valid_mate && (
        <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-r-lg mb-4">
          <h3 className="font-bold text-lg text-green-900 mb-3">🔄 HIGH AVAILABILITY PAIR</h3>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">✅</span>
              <span className="font-mono text-lg">
                {topology.primary} ⇄ {topology.backup}
              </span>
            </div>
            <div className="ml-8 text-gray-700">
              <div><strong>Mode:</strong> {topology.ha_relationship.redundancy_mode}</div>
              <div><strong>Status:</strong> Valid HA Pair - Configured and Operational</div>
            </div>
          </div>
        </div>
      )}

      {/* HA Pair Mismatch */}
      {analysisMode === 'standalone_multiple' && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-r-lg mb-4">
          <h3 className="font-bold text-lg text-yellow-900 mb-3">⚠️ HA PAIR MISMATCH</h3>
          <div className="space-y-2 text-gray-700">
            <div><strong>Brokers:</strong> {topology.ha_relationship?.broker1_name} and {topology.ha_relationship?.broker2_name}</div>
            <div><strong>Status:</strong> NOT configured as HA mates</div>
            <div><strong>Analysis Mode:</strong> Treating as standalone brokers</div>
            <div className="mt-2 text-sm text-yellow-800">
              Note: Brokers are not valid mates of each other. Analyzing each broker independently...
            </div>
          </div>
        </div>
      )}

      {/* Standalone Brokers */}
      {topology.standalone && topology.standalone.length > 0 && (
        <div className="bg-gray-50 border-l-4 border-gray-500 p-6 rounded-r-lg">
          <h3 className="font-bold text-lg text-gray-900 mb-3">📍 STANDALONE BROKERS</h3>
          <ul className="list-disc list-inside space-y-1">
            {topology.standalone.map((broker: string, idx: number) => (
              <li key={idx} className="text-gray-700">
                <span className="font-mono">{broker}</span>
                <span className="text-gray-500 text-sm ml-2">(no HA configured)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
