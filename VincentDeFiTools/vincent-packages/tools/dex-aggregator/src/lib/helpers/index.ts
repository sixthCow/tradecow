import { ethers } from "ethers";

/**
 * Chain ID mapping for supported networks
 */
export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  bsc: 56,
  avalanche: 43114,
};

/**
 * Native token address (used for ETH, MATIC, etc.)
 */
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * ERC20 Token ABI - Essential methods only
 */
export const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

/**
 * 1inch API configuration
 */
export const ONEINCH_API_BASE = "https://api.1inch.dev";
export const ONEINCH_API_VERSION = "v6.0";

/**
 * Interface for 1inch quote response
 */
export interface OneInchQuote {
  dstAmount: string;
  srcAmount: string;
  gas: number;
  protocols: Array<Array<Array<{
    name: string;
    part: number;
    fromTokenAddress: string;
    toTokenAddress: string;
  }>>>;
}

/**
 * Interface for 1inch swap response
 */
export interface OneInchSwap {
  dstAmount: string;
  srcAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: number;
    gasPrice: string;
  };
  protocols: Array<Array<Array<{
    name: string;
    part: number;
    fromTokenAddress: string;
    toTokenAddress: string;
  }>>>;
}

/**
 * Utility function to validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if token is native token (ETH, MATIC, etc.)
 */
export function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
         tokenAddress === "0x0000000000000000000000000000000000000000";
}

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
 * Get token decimals
 */
export async function getTokenDecimals(
  provider: ethers.providers.Provider,
  tokenAddress: string
): Promise<number> {
  if (isNativeToken(tokenAddress)) {
    return 18; // Native tokens typically have 18 decimals
  }
  
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await tokenContract.decimals();
}

/**
 * Get token balance for an address
 */
export async function getTokenBalance(
  provider: ethers.providers.Provider,
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
 * Get token allowance
 */
export async function getTokenAllowance(
  provider: ethers.providers.Provider,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<ethers.BigNumber> {
  if (isNativeToken(tokenAddress)) {
    return ethers.constants.MaxUint256; // Native tokens don't need approval
  }
  
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await tokenContract.allowance(ownerAddress, spenderAddress);
}

/**
 * Parse amount with decimals
 */
export function parseAmount(amount: string, decimals: number): string {
  return ethers.utils.parseUnits(amount, decimals).toString();
}

/**
 * Format amount from wei
 */
export function formatAmount(amount: string, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Get quote from 1inch API
 */
export async function getOneInchQuote(
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  slippageBps: number = 100
): Promise<OneInchQuote> {
  // Convert native token address for 1inch API
  const fromToken = isNativeToken(fromTokenAddress) ? NATIVE_TOKEN_ADDRESS : fromTokenAddress;
  const toToken = isNativeToken(toTokenAddress) ? NATIVE_TOKEN_ADDRESS : toTokenAddress;
  
  const params = new URLSearchParams({
    src: fromToken,
    dst: toToken,
    amount: amount,
    includeProtocols: "true",
    includeGas: "true",
  });

  const url = `${ONEINCH_API_BASE}/${ONEINCH_API_VERSION}/${chainId}/quote?${params}`;
  
  console.log(`[@lit-protocol/vincent-tool-dex-aggregator] Fetching quote from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`1inch API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Get swap transaction data from 1inch API
 */
export async function getOneInchSwap(
  chainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
  slippageBps: number = 100
): Promise<OneInchSwap> {
  // Convert native token address for 1inch API
  const fromToken = isNativeToken(fromTokenAddress) ? NATIVE_TOKEN_ADDRESS : fromTokenAddress;
  const toToken = isNativeToken(toTokenAddress) ? NATIVE_TOKEN_ADDRESS : toTokenAddress;
  
  const params = new URLSearchParams({
    src: fromToken,
    dst: toToken,
    amount: amount,
    from: fromAddress,
    slippage: (slippageBps / 100).toString(), // Convert basis points to percentage
    disableEstimate: "true",
    includeProtocols: "true",
    includeGas: "true",
  });

  const url = `${ONEINCH_API_BASE}/${ONEINCH_API_VERSION}/${chainId}/swap?${params}`;
  
  console.log(`[@lit-protocol/vincent-tool-dex-aggregator] Fetching swap from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`1inch API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Extract DEX name from protocols
 */
export function extractDexName(protocols: OneInchQuote['protocols']): string {
  if (!protocols || protocols.length === 0) {
    return "1inch";
  }
  
  // Get the first protocol name from the route
  const firstRoute = protocols[0];
  if (firstRoute && firstRoute.length > 0 && firstRoute[0].length > 0) {
    return firstRoute[0][0].name;
  }
  
  return "1inch";
}

/**
 * Extract route information from protocols
 */
export function extractRoute(protocols: OneInchQuote['protocols']): string[] {
  if (!protocols || protocols.length === 0) {
    return [];
  }
  
  const route: string[] = [];
  protocols.forEach(routeGroup => {
    routeGroup.forEach(protocolGroup => {
      protocolGroup.forEach(protocol => {
        if (!route.includes(protocol.name)) {
          route.push(protocol.name);
        }
      });
    });
  });
  
  return route;
}

/**
 * Calculate price impact (simplified)
 */
export function calculatePriceImpact(
  fromAmount: string,
  toAmount: string,
  fromDecimals: number,
  toDecimals: number
): string {
  // This is a simplified calculation
  // In a real implementation, you'd need market price data
  const fromAmountFormatted = parseFloat(formatAmount(fromAmount, fromDecimals));
  const toAmountFormatted = parseFloat(formatAmount(toAmount, toDecimals));
  
  // Assuming 1:1 ratio for simplification
  // Real implementation would fetch market prices
  const priceImpact = Math.abs(1 - (toAmountFormatted / fromAmountFormatted)) * 100;
  
  return priceImpact.toFixed(2);
}