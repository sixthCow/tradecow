import { z } from "zod";

/**
 * Order types enum
 */
export enum OrderType {
  DCA = "DCA",           // Dollar Cost Averaging - recurring purchases
  LIMIT = "LIMIT",       // Limit Order - execute when price condition is met
}

/**
 * Order status enum
 */
export enum OrderStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED", 
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED"
}

/**
 * Frequency options for DCA orders
 */
export enum DCAFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY", 
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY"
}

/**
 * Condition types for limit orders
 */
export enum LimitCondition {
  GREATER_THAN = "GREATER_THAN",    // Execute when price >= target
  LESS_THAN = "LESS_THAN"           // Execute when price <= target
}

/**
 * Supported chains for validation
 */
const SUPPORTED_CHAINS = [
  // Mainnets
  "ethereum", "polygon", "avalanche", "arbitrum", "optimism", "base", 
  "fantom", "bnb", "gnosis", "scroll", "metis", "linea", "zksync",
  // Testnets
  "sepolia", "basesepolia", "arbitrumsepolia", "optimismsepolia", 
  "avalanchefuji", "scrollsepolia"
] as const;

/**
 * Tool parameters schema - defines the input parameters for the DCA/Limit Order tool
 */
export const toolParamsSchema = z.object({
  orderType: z.nativeEnum(OrderType),
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
  slippageBps: z
    .number()
    .int()
    .min(1)
    .max(5000) // Max 50% slippage
    .optional()
    .default(100), // 1% default slippage
  
  // DCA-specific parameters
  frequency: z.nativeEnum(DCAFrequency).optional(),
  totalExecutions: z.number().int().min(1).max(1000).optional(), // Max 1000 executions
  nextExecutionTime: z.number().int().optional(), // Unix timestamp
  
  // Limit Order-specific parameters  
  targetPrice: z
    .string()
    .regex(/^\d*\.?\d+$/, "Invalid target price format")
    .optional(),
  condition: z.nativeEnum(LimitCondition).optional(),
  expirationTime: z.number().int().optional(), // Unix timestamp

  // Common optional parameters
  rpcUrl: z.string().url().optional(),
  orderId: z.string().optional(), // For tracking existing orders
}).refine(
  (data) => {
    // DCA validation
    if (data.orderType === OrderType.DCA) {
      return data.frequency && data.totalExecutions && data.nextExecutionTime;
    }
    // Limit order validation  
    if (data.orderType === OrderType.LIMIT) {
      return data.targetPrice && data.condition && data.expirationTime;
    }
    return true;
  },
  {
    message: "Invalid parameters for order type. DCA requires frequency, totalExecutions, and nextExecutionTime. LIMIT requires targetPrice, condition, and expirationTime.",
  }
);

/**
 * Precheck success result schema
 */
export const precheckSuccessSchema = z.object({
  orderValid: z.boolean(),
  conditionMet: z.boolean(), // Whether the order should execute now
  currentPrice: z.string().optional(),
  targetPrice: z.string().optional(),
  userBalance: z.string(),
  tokenAllowance: z.string().optional(),
  estimatedGas: z.number().optional(),
  nextExecutionTime: z.number().optional(),
  executionsRemaining: z.number().optional(),
  dexQuote: z.object({
    estimatedOutput: z.string(),
    priceImpact: z.string(),
    dexName: z.string(),
    routerAddress: z.string(),
  }).optional(),
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
  orderType: z.nativeEnum(OrderType),
  fromTokenAddress: z.string(),
  toTokenAddress: z.string(),
  executedAmount: z.string(),
  receivedAmount: z.string(),
  executionPrice: z.string(),
  timestamp: z.number(),
  orderId: z.string().optional(),
  executionsRemaining: z.number().optional(),
  nextExecutionTime: z.number().optional(),
  dexUsed: z.string().optional(),
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