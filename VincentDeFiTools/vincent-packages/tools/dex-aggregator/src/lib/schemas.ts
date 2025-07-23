import { z } from "zod";

/**
 * Supported chains for DEX aggregation
 */
const SUPPORTED_CHAINS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "bsc", "avalanche"
] as const;

/**
 * Tool parameters schema - defines the input parameters for the DEX aggregator tool
 */
export const toolParamsSchema = z.object({
  fromTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid from token address"),
  toTokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid to token address"),
  amount: z
    .string()
    .regex(/^\d*\.?\d+$/, "Invalid amount format")
    .refine((val) => parseFloat(val) > 0, "Amount must be greater than 0"),
  chain: z.string().refine(
    (val) => SUPPORTED_CHAINS.includes(val.toLowerCase() as any),
    `Chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`
  ),
  slippageBps: z.number().int().min(1).max(5000).default(100), // 1 = 0.01%, 5000 = 50%
  rpcUrl: z.string().optional(), // Only for precheck validation
});

/**
 * Precheck success result schema
 */
export const precheckSuccessSchema = z.object({
  fromTokenAddress: z.string(),
  toTokenAddress: z.string(),
  fromAmount: z.string(),
  estimatedToAmount: z.string(),
  routerAddress: z.string(),
  callData: z.string(),
  estimatedGas: z.number(),
  priceImpact: z.string(),
  dexName: z.string(),
  route: z.array(z.string()).optional(),
  userBalance: z.string(),
  allowance: z.string(),
});

/**
 * Precheck failure result schema
 */
export const precheckFailSchema = z.object({
  error: z.string(),
});

/**
 * Execute success result schema
 */
export const executeSuccessSchema = z.object({
  txHash: z.string(),
  fromTokenAddress: z.string(),
  toTokenAddress: z.string(),
  fromAmount: z.string(),
  estimatedToAmount: z.string(),
  dexName: z.string(),
  timestamp: z.number(),
});

/**
 * Execute failure result schema
 */
export const executeFailSchema = z.object({
  error: z.string(),
});

// Type exports
export type ToolParams = z.infer<typeof toolParamsSchema>;
export type PrecheckSuccess = z.infer<typeof precheckSuccessSchema>;
export type PrecheckFail = z.infer<typeof precheckFailSchema>;
export type ExecuteSuccess = z.infer<typeof executeSuccessSchema>;
export type ExecuteFail = z.infer<typeof executeFailSchema>;