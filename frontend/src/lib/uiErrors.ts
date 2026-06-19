const fetchErrorPatterns = ['failed to fetch', 'networkerror', 'fetch failed', 'unable to reach', 'request failed']
const networkErrorPatterns = [
  'current chain of the wallet',
  'does not match the target chain',
  'chain mismatch',
  'wrong network',
  'wallet_switchethereumchain',
]
const revertErrorPatterns = ['execution reverted', 'transaction reverted', 'revert', 'could not be completed']
const rejectionPatterns = ['user rejected', 'user denied', 'rejected the request', 'request canceled', 'request cancelled']

export function describeUiError(error: unknown): string {
  const message = extractErrorMessage(error)
  const normalized = message.toLowerCase()

  if (networkErrorPatterns.some((pattern) => normalized.includes(pattern))) {
    return 'Please switch to Base Sepolia.'
  }

  if (fetchErrorPatterns.some((pattern) => normalized.includes(pattern))) {
    return 'Unable to reach the service. Please try again.'
  }

  if (revertErrorPatterns.some((pattern) => normalized.includes(pattern))) {
    return 'The transaction could not be completed.'
  }

  if (rejectionPatterns.some((pattern) => normalized.includes(pattern))) {
    return 'Request canceled in your wallet.'
  }

  return 'Something went wrong. Please try again.'
}

export function isWrongNetworkError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase()
  return networkErrorPatterns.some((pattern) => message.includes(pattern))
}

export function logUiError(context: string, error: unknown) {
  console.error(context, error)
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const candidate = error as { shortMessage?: unknown; message?: unknown; details?: unknown; cause?: unknown }
    if (typeof candidate.shortMessage === 'string') return candidate.shortMessage
    if (typeof candidate.message === 'string') return candidate.message
    if (typeof candidate.details === 'string') return candidate.details
    if (candidate.cause) return extractErrorMessage(candidate.cause)
  }
  return ''
}
