interface ReplicationValidationProps {
  bundles: any[]
}

export default function ReplicationValidation({ bundles }: ReplicationValidationProps) {
  if (!bundles || bundles.length === 0) return null

  // Check if any bundles have replication
  const hasReplication = bundles.some(b => b.replication_info?.enabled)

  if (!hasReplication) return null

  // Group by replication sites
  const sites: any[] = []
  const processed = new Set()

  bundles.forEach(bundle => {
    if (processed.has(bundle.router_name)) return
    if (!bundle.replication_info?.enabled) return

    const mate = bundle.replication_info.mate_router
    if (!mate) return

    const siteRole = bundle.replication_info.site_role === 'Active' ? 'Primary Site' : 'Backup Site'

    // Find HA pair at this site
    const siteBrokers = [bundle]
    const haMate = bundle.mate_router_name

    if (haMate && haMate !== 'Unknown' && haMate !== '-') {
      const haMateBundle = bundles.find(b => b.router_name === haMate)
      if (haMateBundle) {
        siteBrokers.push(haMateBundle)
        processed.add(haMateBundle.router_name)
      }
    }

    sites.push({
      role: siteRole,
      brokers: siteBrokers,
      remoteSite: mate
    })

    processed.add(bundle.router_name)
  })

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-6">🔗 Replication Pair Validation</h2>

      {sites.length > 0 ? (
        <div className="space-y-4">
          {sites.map((site, idx) => (
            <div key={idx} className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
              <h3 className="font-bold text-purple-900 mb-2">{site.role} {idx + 1}:</h3>
              <div className="ml-4 space-y-1 text-sm">
                {site.brokers.map((broker: any, bIdx: number) => {
                  const label = broker.activity_status === 'Active'
                    ? `${broker.redundancy_role || 'Primary'}/Active`
                    : `${broker.redundancy_role || 'Backup'}/Standby`

                  return (
                    <div key={bIdx}>
                      {label} Broker: <span className="font-mono font-semibold">{broker.router_name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 italic">No replication configured</p>
      )}
    </div>
  )
}
