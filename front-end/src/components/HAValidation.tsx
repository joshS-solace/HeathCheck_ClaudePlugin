interface HAValidationProps {
  bundles: any[]
}

export default function HAValidation({ bundles }: HAValidationProps) {
  if (!bundles || bundles.length === 0) return null

  // Find HA pairs
  const pairs: any[] = []
  const processed = new Set()

  bundles.forEach(bundle => {
    if (processed.has(bundle.router_name)) return

    const mate = bundle.mate_router_name
    if (!mate || mate === 'Unknown' || mate === '-') return

    // Find mate in bundles
    const mateBundle = bundles.find(b => b.router_name === mate)

    const activity = bundle.activity_status || 'Unknown'
    const role = bundle.redundancy_role || 'Unknown'

    let label1 = activity === 'Active' ? 'Primary/Active' : 'Backup/Standby'
    if (role !== 'Unknown') {
      label1 = activity === 'Active' ? `${role}/Active` : `${role}/Standby`
    }

    const pair: any = {
      broker1: bundle.router_name,
      label1: label1,
      broker2: mate,
      label2: 'Unknown',
      hasMate: !!mateBundle
    }

    if (mateBundle) {
      const mateActivity = mateBundle.activity_status || 'Unknown'
      const mateRole = mateBundle.redundancy_role || 'Unknown'

      let label2 = mateActivity === 'Active' ? 'Backup/Active' : 'Backup/Standby'
      if (mateRole !== 'Unknown') {
        label2 = mateActivity === 'Active' ? `${mateRole}/Active` : `${mateRole}/Standby`
      }

      pair.label2 = label2
      processed.add(mateBundle.router_name)
    } else {
      pair.label2 = '[INFO] Missing GD'
    }

    pairs.push(pair)
    processed.add(bundle.router_name)
  })

  if (pairs.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-solace-darkBlue mb-6">🔄 HA Pair Validation</h2>

      <div className="space-y-4">
        {pairs.map((pair, idx) => (
          <div key={idx} className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <h3 className="font-bold text-blue-900 mb-2">HA Pair {idx + 1}:</h3>
            <div className="ml-4 space-y-1 text-sm">
              <div>
                {pair.label1} Broker: <span className="font-mono font-semibold text-blue-900">{pair.broker1}</span>
              </div>
              <div>
                {pair.label2} Broker:
                <span className={`font-mono font-semibold ml-2 ${pair.hasMate ? 'text-blue-900' : 'text-gray-500'}`}>
                  {pair.broker2}
                </span>
                {!pair.hasMate && <span className="text-gray-500 ml-2 text-xs">(missing gather-diagnostics)</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
