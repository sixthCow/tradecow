import { ethers } from "ethers";
import { ChainConfig, PortfolioAllocation, CurrentAllocation, RebalanceAction } from "../schemas";

/**
 * Chain ID mappings for supported networks
 */
export const CHAIN_IDS: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  arbitrum: "42161",
  optimism: "10",
  polygon: "137",
  avalanche: "43114",
  bsc: "56",
  // Testnets
  sepolia: "11155111",
  basesepolia: "84532",
  arbitrumsepolia: "421614",
  optimismsepolia: "11155420",
};

/**
 * Native token addresses (represented as zero address)
 */
export const NATIVE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Common token addresses across chains
 */
export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  ethereum: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86a33E6441E8Db5f9Bbf8F6bDbF1D8c6a6E8c",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  base: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
  arbitrum: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  },
};

/**
 * Standard ERC20 ABI for token operations
 */
export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
];

/**
 * Get chain ID for a given chain name
 */
export function getChainId(chainName: string): string {
  const chainId = CHAIN_IDS[chainName.toLowerCase()];
  if (!chainId) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }
  return chainId;
}

/**
 * Check if an address is a native token (ETH, MATIC, etc.)
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return ethers.utils.isAddress(address);
}

/**
 * Get token balance for an address on a specific chain
 */
export async function getTokenBalance(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string,
  userAddress: string
): Promise<ethers.BigNumber> {
  if (isNativeToken(tokenAddress)) {
    return await provider.getBalance(userAddress);
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await tokenContract.balanceOf(userAddress);
}

/**
 * Get token decimals
 */
export async function getTokenDecimals(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string
): Promise<number> {
  if (isNativeToken(tokenAddress)) {
    return 18; // ETH and most native tokens have 18 decimals
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await tokenContract.decimals();
}

/**
 * Format token amount from wei to human readable
 */
export function formatTokenAmount(amount: ethers.BigNumber, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Parse token amount from human readable to wei
 */
export function parseTokenAmount(amount: string, decimals: number): ethers.BigNumber {
  return ethers.utils.parseUnits(amount, decimals);
}

/**
 * Get token price in USD (simplified - in production would use price oracle)
 */
export async function getTokenPriceUSD(tokenSymbol: string): Promise<number> {
  // Simplified price fetching - in production, integrate with price oracles like Chainlink
  const mockPrices: Record<string, number> = {
    ETH: 2500,
    WETH: 2500,
    USDC: 1,
    USDT: 1,
    BTC: 45000,
    WBTC: 45000,
  };

  return mockPrices[tokenSymbol.toUpperCase()] || 0;
}

/**
 * Read current portfolio across all chains
 */
export async function readPortfolioBalances(
  chainConfigs: ChainConfig[],
  targetAllocations: PortfolioAllocation[],
  userAddress: string
): Promise<CurrentAllocation[]> {
  const currentAllocations: CurrentAllocation[] = [];
  let totalPortfolioValueUsd = 0;

  // First pass: get all balances and calculate total value
  for (const allocation of targetAllocations) {
    const chainConfig = chainConfigs.find(c => c.name.toLowerCase() === allocation.chain.toLowerCase());
    if (!chainConfig) {
      throw new Error(`Chain configuration not found for chain: ${allocation.chain}`);
    }

    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
    
    try {
      const balance = await getTokenBalance(provider, allocation.tokenAddress, userAddress);
      const decimals = await getTokenDecimals(provider, allocation.tokenAddress);
      const balanceFormatted = formatTokenAmount(balance, decimals);
      const tokenPrice = await getTokenPriceUSD(allocation.tokenSymbol);
      const usdValue = parseFloat(balanceFormatted) * tokenPrice;

      totalPortfolioValueUsd += usdValue;

      currentAllocations.push({
        tokenSymbol: allocation.tokenSymbol,
        tokenAddress: allocation.tokenAddress,
        chain: allocation.chain,
        balance: balanceFormatted,
        balanceWei: balance.toString(),
        usdValue: usdValue.toString(),
        currentPercentage: 0, // Will be calculated in second pass
        targetPercentage: allocation.targetPercentage,
        drift: 0, // Will be calculated in second pass
      });
    } catch (error) {
      console.error(`Error reading balance for ${allocation.tokenSymbol} on ${allocation.chain}:`, error);
      // Add zero balance entry
      currentAllocations.push({
        tokenSymbol: allocation.tokenSymbol,
        tokenAddress: allocation.tokenAddress,
        chain: allocation.chain,
        balance: "0",
        balanceWei: "0",
        usdValue: "0",
        currentPercentage: 0,
        targetPercentage: allocation.targetPercentage,
        drift: 0,
      });
    }
  }

  // Second pass: calculate percentages and drift
  for (const allocation of currentAllocations) {
    const usdValue = parseFloat(allocation.usdValue);
    allocation.currentPercentage = totalPortfolioValueUsd > 0 ? (usdValue / totalPortfolioValueUsd) * 100 : 0;
    allocation.drift = allocation.currentPercentage - allocation.targetPercentage;
  }

  return currentAllocations;
}

/**
 * Determine if rebalancing is needed based on strategy
 */
export function needsRebalancing(
  currentAllocations: CurrentAllocation[],
  strategy: string,
  thresholdPercent: number
): { needsRebalancing: boolean; worstDrift: number; reason: string } {
  const worstDrift = Math.max(...currentAllocations.map(a => Math.abs(a.drift)));

  switch (strategy) {
    case "THRESHOLD":
      const needsRebalancing = worstDrift > thresholdPercent;
      return {
        needsRebalancing,
        worstDrift,
        reason: needsRebalancing 
          ? `Allocation drift of ${worstDrift.toFixed(2)}% exceeds threshold of ${thresholdPercent}%`
          : `All allocations within ${thresholdPercent}% threshold`
      };

    case "IMMEDIATE":
      return {
        needsRebalancing: true,
        worstDrift,
        reason: "Immediate rebalancing requested"
      };

    case "PERIODIC":
      // For periodic, we assume the calling system determines timing
      return {
        needsRebalancing: true,
        worstDrift,
        reason: "Periodic rebalancing triggered"
      };

    default:
      throw new Error(`Unknown rebalancing strategy: ${strategy}`);
  }
}

/**
 * Calculate rebalancing actions needed
 */
export function calculateRebalanceActions(
  currentAllocations: CurrentAllocation[],
  minRebalanceAmountUsd: number
): RebalanceAction[] {
  const actions: RebalanceAction[] = [];

  // Group allocations by token symbol to handle cross-chain rebalancing
  const tokenGroups = new Map<string, CurrentAllocation[]>();
  for (const allocation of currentAllocations) {
    const existing = tokenGroups.get(allocation.tokenSymbol) || [];
    existing.push(allocation);
    tokenGroups.set(allocation.tokenSymbol, existing);
  }

  let actionPriority = 1;

  // For each token, determine cross-chain rebalancing needs
  for (const [tokenSymbol, allocations] of tokenGroups) {
    if (allocations.length === 1) continue; // Single chain, no cross-chain rebalancing

    // Find chains that need tokens vs chains that have excess
    const needsMore: CurrentAllocation[] = [];
    const hasExcess: CurrentAllocation[] = [];

    for (const allocation of allocations) {
      if (allocation.drift < -1) { // Needs more (current < target)
        needsMore.push(allocation);
      } else if (allocation.drift > 1) { // Has excess (current > target)
        hasExcess.push(allocation);
      }
    }

    // Create bridge actions from excess to needed
    for (const excess of hasExcess) {
      for (const needed of needsMore) {
        if (excess.chain === needed.chain) continue;

        const excessUsd = Math.abs(excess.drift) * parseFloat(excess.usdValue) / excess.currentPercentage;
        const neededUsd = Math.abs(needed.drift) * parseFloat(needed.usdValue) / needed.currentPercentage;
        const transferUsd = Math.min(excessUsd, neededUsd);

        if (transferUsd >= minRebalanceAmountUsd) {
          const tokenPrice = parseFloat(excess.usdValue) / parseFloat(excess.balance) || 1;
          const transferAmount = (transferUsd / tokenPrice).toFixed(6);

          actions.push({
            type: "BRIDGE",
            fromChain: excess.chain,
            toChain: needed.chain,
            fromToken: excess.tokenAddress,
            toToken: needed.tokenAddress,
            amount: transferAmount,
            amountWei: parseTokenAmount(transferAmount, 18).toString(), // Simplified, should get actual decimals
            priority: actionPriority++,
          });
        }
      }
    }
  }

  // For single-chain rebalancing, create swap actions
  const chainGroups = new Map<string, CurrentAllocation[]>();
  for (const allocation of currentAllocations) {
    const existing = chainGroups.get(allocation.chain) || [];
    existing.push(allocation);
    chainGroups.set(allocation.chain, existing);
  }

  for (const [chain, allocations] of chainGroups) {
    if (allocations.length === 1) continue;

    const needsMore = allocations.filter(a => a.drift < -1);
    const hasExcess = allocations.filter(a => a.drift > 1);

    for (const excess of hasExcess) {
      for (const needed of needsMore) {
        const excessUsd = Math.abs(excess.drift) * parseFloat(excess.usdValue) / excess.currentPercentage;
        const neededUsd = Math.abs(needed.drift) * parseFloat(needed.usdValue) / needed.currentPercentage;
        const swapUsd = Math.min(excessUsd, neededUsd);

        if (swapUsd >= minRebalanceAmountUsd) {
          const tokenPrice = parseFloat(excess.usdValue) / parseFloat(excess.balance) || 1;
          const swapAmount = (swapUsd / tokenPrice).toFixed(6);

          actions.push({
            type: "SWAP",
            fromChain: chain,
            fromToken: excess.tokenAddress,
            toToken: needed.tokenAddress,
            amount: swapAmount,
            amountWei: parseTokenAmount(swapAmount, 18).toString(),
            priority: actionPriority++,
          });
        }
      }
    }
  }

  // Sort by priority
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * Estimate gas costs for rebalancing actions
 */
export function estimateRebalanceGasCosts(actions: RebalanceAction[]): {
  totalGasWei: string;
  estimatedTimeSeconds: number;
} {
  let totalGas = ethers.BigNumber.from(0);
  let estimatedTime = 0;

  for (const action of actions) {
    switch (action.type) {
      case "SWAP":
        totalGas = totalGas.add(ethers.utils.parseUnits("200000", "wei")); // ~200k gas
        estimatedTime += 30; // 30 seconds per swap
        break;
      case "BRIDGE":
        totalGas = totalGas.add(ethers.utils.parseUnits("300000", "wei")); // ~300k gas
        estimatedTime += 300; // 5 minutes per bridge
        break;
      case "BRIDGE_AND_SWAP":
        totalGas = totalGas.add(ethers.utils.parseUnits("500000", "wei")); // ~500k gas
        estimatedTime += 330; // 5.5 minutes per bridge+swap
        break;
    }
  }

  return {
    totalGasWei: totalGas.toString(),
    estimatedTimeSeconds: estimatedTime,
  };
}