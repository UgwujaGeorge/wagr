import { Attribution } from 'ox/erc8021'

export const WAGR_BUILDER_CODE = 'bc_xgzy178x' as const

// Shared ERC-8021 suffix used by every Base write path in the app and relayer.
export const WAGR_DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [WAGR_BUILDER_CODE],
})
