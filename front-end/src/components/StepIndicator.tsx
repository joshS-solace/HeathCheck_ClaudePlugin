interface StepIndicatorProps {
  currentStep: 1 | 2 | 3
}

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  const steps = [
    { number: 1, label: 'Upload Files' },
    { number: 2, label: 'Broker Context' },
    { number: 3, label: 'Health Results' },
  ]

  return (
    <div>
      <div className="flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                  step.number === currentStep
                    ? 'bg-solace-green text-white ring-4 ring-solace-green-200 scale-110'
                    : step.number < currentStep
                    ? 'bg-solace-green text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}
              >
                {step.number < currentStep ? '✓' : step.number}
              </div>
              <span
                className={`mt-2 text-sm font-semibold whitespace-nowrap ${
                  step.number === currentStep
                    ? 'text-solace-green'
                    : step.number < currentStep
                    ? 'text-solace-green'
                    : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`w-24 h-1 mx-4 transition-all ${
                  step.number < currentStep ? 'bg-solace-green' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
