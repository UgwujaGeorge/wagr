import { z } from 'zod'

const supportedChainIdSchema = z.union([z.literal(84532), z.literal(8453)])

export const metadataSchema = z.object({
  chainId: z.preprocess((value) => value ?? 84532, supportedChainIdSchema),
  duelId: z.string().min(1),
  claim: z.string().min(10),
  resolutionRules: z.string().min(10),
  evidenceUrls: z.array(z.string().url()).min(1).max(5),
  allowedSourceTypes: z.array(z.string().min(2)).min(1),
  category: z.string().optional(),
  expiryTime: z.string().min(1),
  creatorSide: z.enum(['YES', 'NO']),
  counterpartySide: z.enum(['YES', 'NO']),
  metadataHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
})
