interface BrokerContextProps {
  bundles: any[]
}

export default function BrokerContext({ bundles }: BrokerContextProps) {
  if (!bundles || bundles.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-6" style={{ color: '#0C4F60' }}>📋 Broker Context</h2>

      <div className="space-y-6">
        {bundles.map((bundle, idx) => {
          const routerName = bundle.router_name || `Broker ${idx + 1}`
          const serialNumber = bundle.serial_number || 'Unknown'
          const redundancyMode = bundle.redundancy_mode || 'N/A'
          const redundancyRole = bundle.redundancy_role || 'Unknown'
          const activityStatus = bundle.activity_status || 'Unknown'
          const mateRouter = bundle.mate_router_name || 'None'
          const replicationStatus = bundle.replication_info?.status || 'N/A'

          return (
            <div key={idx} className="border-l-4 p-6 rounded-r-lg" style={{ borderColor: '#00C7B7', backgroundColor: 'rgba(230, 249, 247, 0.3)' }}>
              <h3 className="font-bold text-lg mb-4" style={{ color: '#0C4F60' }}>
                Broker {idx + 1} - Redundant Appliance
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Router Name:</span>
                  <span className="font-bold" style={{ color: '#0C4F60' }}>{routerName}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Serial Number:</span>
                  <span className="text-gray-900 font-mono">{serialNumber}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Redundancy Mode:</span>
                  <span className="text-gray-900 font-semibold">{redundancyMode}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Redundancy Role:</span>
                  <span className="text-gray-900">{redundancyRole}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Active-Standby Role:</span>
                  <span className="text-gray-900 font-semibold">{activityStatus}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Mate Router:</span>
                  <span className="font-semibold" style={{ color: '#00C7B7' }}>{mateRouter}</span>
                </div>

                <div className="flex">
                  <span className="font-semibold text-gray-700 w-48">Replication:</span>
                  <span className="text-gray-900">{replicationStatus}</span>
                </div>

                {bundle.replication_info?.mate_router && (
                  <>
                    <div className="flex">
                      <span className="font-semibold text-gray-700 w-48">Replication Mate:</span>
                      <span className="text-gray-900">{bundle.replication_info.mate_router}</span>
                    </div>

                    <div className="flex">
                      <span className="font-semibold text-gray-700 w-48">Replication Site:</span>
                      <span className="text-gray-900">{bundle.replication_info.site_role || 'Unknown'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
