import { ethers } from "ethers";
import { OrderType, DCAFrequency, LimitCondition } from "../schemas";

/**
 * Chain ID mappings
 */
export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  avalanche: 43114,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  fantom: 250,
  bnb: 56,
  gnosis: 100,
  scroll: 534352,
  metis: 1088,
  linea: 59144,
  zksync: 324,
  // Testnets
  sepolia: 11155111,
  basesepolia: 84532,
  arbitrumsepolia: 421614,
  optimismsepolia: 11155420,
  avalanchefuji: 43113,
  scrollsepolia: 534351,
};

/**
 * Get chain ID from chain name
 */
export function getChainId(chain: string): number {
  const chainId = CHAIN_IDS[chain.toLowerCase()];
  if (!chainId) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  return chainId;
}

/**
 * ERC20 ABI for token operations
 */
export const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
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
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if token is native ETH (zero address)
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress === "0x0000000000000000000000000000000000000000" || 
         tokenAddress === ethers.constants.AddressZero;
}

/**
 * Get token decimals
 */
export async function getTokenDecimals(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string
): Promise<number> {
  if (isNativeToken(tokenAddress)) {
    return 18; // ETH has 18 decimals
  }

  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await contract.decimals();
}

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string,
  userAddress: string
): Promise<ethers.BigNumber> {
  if (isNativeToken(tokenAddress)) {
    return await provider.getBalance(userAddress);
  }

  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await contract.balanceOf(userAddress);
}

/**
 * Get token allowance for spender
 */
export async function getTokenAllowance(
  provider: ethers.providers.JsonRpcProvider,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<ethers.BigNumber> {
  if (isNativeToken(tokenAddress)) {
    return ethers.constants.MaxUint256; // Native tokens don't need allowance
  }

  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await contract.allowance(ownerAddress, spenderAddress);
}

/**
 * Parse amount to wei/smallest unit with proper decimals
 */
export function parseAmount(amount: string, decimals: number): string {
  return ethers.utils.parseUnits(amount, decimals).toString();
}

/**
 * Format amount from wei/smallest unit to human-readable format
 */
export function formatAmount(amount: string, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Get current timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate next execution time for DCA orders
 */
export function calculateNextExecutionTime(
  frequency: DCAFrequency,
  currentTime?: number
): number {
  const now = currentTime || getCurrentTimestamp();
  
  switch (frequency) {
    case DCAFrequency.DAILY:
      return now + (24 * 60 * 60); // 1 day
    case DCAFrequency.WEEKLY:
      return now + (7 * 24 * 60 * 60); // 7 days
    case DCAFrequency.BIWEEKLY:
      return now + (14 * 24 * 60 * 60); // 14 days
    case DCAFrequency.MONTHLY:
      return now + (30 * 24 * 60 * 60); // 30 days (approximate)
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

/**
 * Check if DCA order should execute based on timing
 */
export function shouldExecuteDCA(nextExecutionTime: number): boolean {
  const now = getCurrentTimestamp();
  return now >= nextExecutionTime;
}

/**
 * Check if limit order should execute based on price condition
 */
export function shouldExecuteLimitOrder(
  currentPrice: string,
  targetPrice: string,
  condition: LimitCondition
): boolean {
  const current = parseFloat(currentPrice);
  const target = parseFloat(targetPrice);
  
  switch (condition) {
    case LimitCondition.GREATER_THAN:
      return current >= target;
    case LimitCondition.LESS_THAN:
      return current <= target;
    default:
      return false;
  }
}

/**
 * Check if limit order has expired
 */
export function isOrderExpired(expirationTime: number): boolean {
  const now = getCurrentTimestamp();
  return now >= expirationTime;
}

/**
 * Generate unique order ID
 */
export function generateOrderId(
  orderType: OrderType,
  userAddress: string,
  timestamp?: number
): string {
  const ts = timestamp || getCurrentTimestamp();
  const hash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${orderType}-${userAddress}-${ts}`)
  );
  return hash.substring(0, 10); // Take first 8 characters after 0x
}

/**
 * Get token price from 1inch API
 */
export async function getTokenPrice(
  chainId: number,
  tokenAddress: string,
  baseTokenAddress: string = "0x0000000000000000000000000000000000000000" // ETH
): Promise<string> {
  try {
    const response = await fetch(
      `https://api.1inch.dev/swap/v6.0/${chainId}/quote?src=${baseTokenAddress}&dst=${tokenAddress}&amount=1000000000000000000&includeTokensInfo=false&includeProtocols=false&includeGas=false`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Calculate price: output amount / input amount (both normalized to 18 decimals)
    const inputAmount = ethers.BigNumber.from("1000000000000000000"); // 1 ETH
    const outputAmount = ethers.BigNumber.from(data.dstAmount);
    
    // Price = output / input (token per ETH)
    const price = outputAmount.mul(ethers.constants.WeiPerEther).div(inputAmount);
    return ethers.utils.formatEther(price);
  } catch (error) {
    throw new Error(`Failed to get token price: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get 1inch quote for token swap (reuse from DEX aggregator)
 */
export async function getOneInchQuote(
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  slippageBps: number = 100
): Promise<any> {
  try {
    const response = await fetch(
      `https://api.1inch.dev/swap/v6.0/${chainId}/quote?src=${fromTokenAddress}&dst=${toTokenAddress}&amount=${amount}&includeTokensInfo=false&includeProtocols=true&includeGas=true`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to get 1inch quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get 1inch swap transaction data (reuse from DEX aggregator)
 */
export async function getOneInchSwap(
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
  slippageBps: number = 100
): Promise<any> {
  try {
    const response = await fetch(
      `https://api.1inch.dev/swap/v6.0/${chainId}/swap?src=${fromTokenAddress}&dst=${toTokenAddress}&amount=${amount}&from=${fromAddress}&slippage=${slippageBps / 100}&disableEstimate=true`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to get 1inch swap data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract DEX name from 1inch protocols response
 */
export function extractDexName(protocols: any[][]): string {
  if (!protocols || protocols.length === 0) return "1inch";
  
  try {
    const firstRoute = protocols[0];
    if (firstRoute && firstRoute.length > 0) {
      return firstRoute[0].name || "1inch";
    }
  } catch (error) {
    // Fallback to 1inch if extraction fails
  }
  
  return "1inch";
}

/**
 * Calculate price impact percentage
 */
export function calculatePriceImpact(
  inputAmount: string,
  outputAmount: string,
  inputDecimals: number,
  outputDecimals: number
): string {
  try {
    // This is a simplified price impact calculation
    // In reality, you'd need market price data for accurate calculation
    const input = parseFloat(formatAmount(inputAmount, inputDecimals));
    const output = parseFloat(formatAmount(outputAmount, outputDecimals));
    
    // Assume 1:1 price for simplification (in reality, fetch market rates)
    const expectedOutput = input;
    const priceImpact = ((expectedOutput - output) / expectedOutput) * 100;
    
    return Math.abs(priceImpact).toFixed(2);
  } catch (error) {
    return "0.00";
  }
}

/**
 * Validate order parameters based on type
 */
export function validateOrderParameters(orderType: OrderType, params: any): { valid: boolean; error?: string } {
  if (orderType === OrderType.DCA) {
    if (!params.frequency || !params.totalExecutions || !params.nextExecutionTime) {
      return {
        valid: false,
        error: "DCA orders require frequency, totalExecutions, and nextExecutionTime"
      };
    }
    
    if (params.totalExecutions <= 0) {
      return {
        valid: false,
        error: "totalExecutions must be greater than 0"
      };
    }
    
    if (params.nextExecutionTime <= getCurrentTimestamp()) {
      return {
        valid: false,
        error: "nextExecutionTime must be in the future"
      };
    }
  }
  
  if (orderType === OrderType.LIMIT) {
    if (!params.targetPrice || !params.condition || !params.expirationTime) {
      return {
        valid: false,
        error: "Limit orders require targetPrice, condition, and expirationTime"
      };
    }
    
    if (parseFloat(params.targetPrice) <= 0) {
      return {
        valid: false,
        error: "targetPrice must be greater than 0"
      };
    }
    
    if (params.expirationTime <= getCurrentTimestamp()) {
      return {
        valid: false,
        error: "expirationTime must be in the future"
      };
    }
  }
  
  return { valid: true };
}