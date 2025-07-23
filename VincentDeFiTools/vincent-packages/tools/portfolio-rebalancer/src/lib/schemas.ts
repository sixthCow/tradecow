import { z } from "zod";

export const RebalanceStrategy = {
  THRESHOLD: "THRESHOLD", // Rebalance when allocation drifts beyond threshold
  PERIODIC: "PERIODIC",   // Rebalance at regular intervals
  IMMEDIATE: "IMMEDIATE", // Rebalance immediately
} as const;

export type RebalanceStrategy = (typeof RebalanceStrategy)[keyof typeof RebalanceStrategy];

export const SUPPORTED_CHAINS = [
  "ethereum", "base", "arbitrum", "optimism", "polygon", "avalanche", "bsc",
  // Testnets
  "sepolia", "basesepolia", "arbitrumsepolia", "optimismsepolia"
] as const;

export type SupportedChain = typeof SUPPORTED_CHAINS[number];

// Portfolio target allocation schema
export const portfolioAllocationSchema = z.object({
  tokenSymbol: z.string().min(1, "Token symbol is required"),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token address"),
  targetPercentage: z.number().min(0).max(100, "Target percentage must be between 0 and 100"),
  chain: z.string().refine(
    (val) => SUPPORTED_CHAINS.includes(val.toLowerCase() as any),
    `Chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`
  ),
});

export type PortfolioAllocation = z.infer<typeof portfolioAllocationSchema>;

// Chain configuration schema
export const chainConfigSchema = z.object({
  chainId: z.string().describe("Chain ID (e.g., '1' for Ethereum)"),
  rpcUrl: z.string().url().describe("RPC URL for the chain"),
  name: z.string().describe("Human-readable chain name"),
});

export type ChainConfig = z.infer<typeof chainConfigSchema>;

export const toolParamsSchema = z.object({
  // Portfolio configuration
  targetAllocations: z.array(portfolioAllocationSchema)
    .min(1, "At least one target allocation is required")
    .refine(
      (allocations) => {
        const totalPercentage = allocations.reduce((sum, alloc) => sum + alloc.targetPercentage, 0);
        return Math.abs(totalPercentage - 100) < 0.01; // Allow for small floating point errors
      },
      "Target allocations must sum to 100%"
    ),
  
  // Chain configurations
  chainConfigs: z.array(chainConfigSchema)
    .min(1, "At least one chain configuration is required"),

  // Rebalancing strategy
  strategy: z.nativeEnum(RebalanceStrategy).default(RebalanceStrategy.THRESHOLD),
  
  // Threshold settings (for THRESHOLD strategy)
  rebalanceThresholdPercent: z.number()
    .min(0.1)
    .max(50)
    .default(5)
    .describe("Rebalance when allocation drifts more than this percentage from target"),

  // Slippage settings
  swapSlippageBps: z.number().int().min(1).max(5000).default(100).describe("Slippage for swaps in basis points"),
  bridgeSlippageBps: z.number().int().min(1).max(5000).default(100).describe("Slippage for bridges in basis points"),

  // Gas and execution settings
  maxGasPrice: z.string().optional().describe("Maximum gas price in wei"),
  dryRun: z.boolean().default(false).describe("Simulate rebalancing without executing"),
  
  // Optional execution constraints
  minRebalanceAmount: z.string().default("1.0").describe("Minimum USD value to trigger rebalancing"),
  maxRebalanceAmount: z.string().optional().describe("Maximum USD value per rebalancing operation"),
}).refine(
  (data) => {
    // Validate that all chains in target allocations have corresponding chain configs
    const configChains = new Set(data.chainConfigs.map(c => c.name.toLowerCase()));
    const allocationChains = new Set(data.targetAllocations.map(a => a.chain.toLowerCase()));
    
    for (const chain of allocationChains) {
      if (!configChains.has(chain)) {
        return false;
      }
    }
    return true;
  },
  "All chains in target allocations must have corresponding chain configurations"
);

export type ToolParams = z.infer<typeof toolParamsSchema>;

// Current portfolio state schema
export const currentAllocationSchema = z.object({
  tokenSymbol: z.string(),
  tokenAddress: z.string(),
  chain: z.string(),
  balance: z.string().describe("Token balance in human-readable format"),
  balanceWei: z.string().describe("Token balance in smallest unit"),
  usdValue: z.string().describe("USD value of the balance"),
  currentPercentage: z.number().describe("Current percentage of total portfolio"),
  targetPercentage: z.number().describe("Target percentage"),
  drift: z.number().describe("Difference between current and target percentage"),
});

export type CurrentAllocation = z.infer<typeof currentAllocationSchema>;

// Rebalancing action schema
export const rebalanceActionSchema = z.object({
  type: z.enum(["SWAP", "BRIDGE", "BRIDGE_AND_SWAP"]),
  fromChain: z.string(),
  toChain: z.string().optional(),
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.string().describe("Amount in human-readable format"),
  amountWei: z.string().describe("Amount in smallest unit"),
  estimatedGas: z.string().optional(),
  priority: z.number().describe("Execution priority (lower = higher priority)"),
});

export type RebalanceAction = z.infer<typeof rebalanceActionSchema>;

export const precheckSuccessSchema = z.object({
  data: z.object({
    needsRebalancing: z.boolean().describe("Whether portfolio needs rebalancing"),
    totalPortfolioValueUsd: z.string().describe("Total portfolio value in USD"),
    currentAllocations: z.array(currentAllocationSchema),
    plannedActions: z.array(rebalanceActionSchema),
    estimatedTotalGas: z.string().describe("Estimated total gas cost in wei"),
    estimatedExecutionTime: z.string().describe("Estimated execution time in seconds"),
    worstCaseDrift: z.number().describe("Largest allocation drift percentage"),
  }),
});

export const precheckFailSchema = z.object({
  error: z.string(),
});

export const executeSuccessSchema = z.object({
  data: z.object({
    rebalanceComplete: z.boolean(),
    executedActions: z.array(z.object({
      type: z.string(),
      txHash: z.string(),
      fromChain: z.string(),
      toChain: z.string().optional(),
      fromToken: z.string(),
      toToken: z.string(),
      executedAmount: z.string(),
      timestamp: z.number(),
    })),
    finalAllocations: z.array(currentAllocationSchema),
    totalGasUsed: z.string(),
    executionTimeSeconds: z.number(),
  }),
});

export const executeFailSchema = z.object({
  error: z.string(),
});