# Cross-Chain Portfolio Rebalancer Tool

A sophisticated Vincent SDK tool that automatically rebalances cryptocurrency portfolios across multiple blockchains by leveraging DeBridge for cross-chain transfers and DEX aggregators for swaps.

## Overview

The Portfolio Rebalancer Tool solves the complex problem of maintaining target asset allocations across multiple blockchains. It automatically detects when your portfolio drifts from target allocations and executes a series of cross-chain bridges and swaps to restore balance.

## Key Features

- **Multi-Chain Support**: Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, BSC, and their testnets
- **Intelligent Rebalancing**: Threshold-based, periodic, or immediate rebalancing strategies
- **Cross-Chain Orchestration**: Seamlessly combines DeBridge and DEX Aggregator tools
- **Gas Optimization**: Estimates and optimizes gas costs across operations
- **Comprehensive Validation**: Pre-execution checks and dry-run capabilities
- **Flexible Configuration**: Customizable slippage, thresholds, and execution limits

## Use Case Example

**Problem**: "I want to maintain a 60% ETH / 40% USDC portfolio across Ethereum and Base. When ETH on Base drops below 55% of my total portfolio, automatically bridge USDC from Ethereum to Base and swap for ETH until the target allocation is restored."

**Solution**: The Portfolio Rebalancer Tool monitors your allocations and automatically executes the necessary bridges and swaps to maintain your target percentages.

## Installation

```bash
npm install @lit-protocol/vincent-tool-portfolio-rebalancer
```

## Basic Usage

```typescript
import { vincentTool } from "@lit-protocol/vincent-tool-portfolio-rebalancer";

const rebalanceParams = {
  targetAllocations: [
    {
      tokenSymbol: "ETH",
      tokenAddress: "0x0000000000000000000000000000000000000000", // Native ETH
      targetPercentage: 30,
      chain: "ethereum"
    },
    {
      tokenSymbol: "ETH", 
      tokenAddress: "0x0000000000000000000000000000000000000000", // Native ETH
      targetPercentage: 30,
      chain: "base"
    },
    {
      tokenSymbol: "USDC",
      tokenAddress: "0xA0b86a33E6441E8Db5f9Bbf8F6bDbF1D8c6a6E8c",
      targetPercentage: 20,
      chain: "ethereum"
    },
    {
      tokenSymbol: "USDC",
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      targetPercentage: 20,
      chain: "base"
    }
  ],
  chainConfigs: [
    {
      chainId: "1",
      name: "ethereum",
      rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY"
    },
    {
      chainId: "8453",
      name: "base", 
      rpcUrl: "https://base-mainnet.g.alchemy.com/v2/YOUR-API-KEY"
    }
  ],
  strategy: "THRESHOLD",
  rebalanceThresholdPercent: 5, // Rebalance when drift > 5%
  swapSlippageBps: 100, // 1% slippage for swaps
  bridgeSlippageBps: 100, // 1% slippage for bridges
  minRebalanceAmount: "10.0", // Minimum $10 to trigger action
  dryRun: false
};

// Execute rebalancing
const result = await vincentTool.execute(rebalanceParams);
```

## Advanced Configuration

### Rebalancing Strategies

1. **THRESHOLD**: Rebalance when allocation drift exceeds threshold
2. **PERIODIC**: Rebalance at regular intervals (timing controlled externally)  
3. **IMMEDIATE**: Rebalance immediately regardless of drift

### Slippage and Gas Controls

```typescript
const advancedParams = {
  // ...basic params...
  swapSlippageBps: 50, // 0.5% slippage for swaps
  bridgeSlippageBps: 100, // 1% slippage for bridges
  maxGasPrice: "50000000000", // 50 gwei max
  maxRebalanceAmount: "1000.0", // Max $1000 per operation
  minRebalanceAmount: "5.0" // Min $5 to trigger
};
```

### Dry Run Mode

Test your rebalancing strategy without executing transactions:

```typescript
const dryRunParams = {
  // ...your params...
  dryRun: true
};

const result = await vincentTool.precheck(dryRunParams);
console.log("Would execute:", result.data.plannedActions);
```

## Supported Chains

### Mainnets
- Ethereum (chainId: 1)
- Base (chainId: 8453) 
- Arbitrum (chainId: 42161)
- Optimism (chainId: 10)
- Polygon (chainId: 137)
- Avalanche (chainId: 43114)
- BSC (chainId: 56)

### Testnets
- Sepolia (chainId: 11155111)
- Base Sepolia (chainId: 84532)
- Arbitrum Sepolia (chainId: 421614)
- Optimism Sepolia (chainId: 11155420)

## Tool Integration

The Portfolio Rebalancer leverages existing Vincent tools:

- **DeBridge Tool**: For cross-chain token transfers
- **DEX Aggregator Tool**: For optimal token swaps
- **ERC20 Approval Tool**: For token approvals (when needed)

## API Reference

### Tool Parameters

```typescript
interface ToolParams {
  targetAllocations: PortfolioAllocation[]; // Target portfolio composition
  chainConfigs: ChainConfig[]; // Chain RPC configurations
  strategy: RebalanceStrategy; // When to rebalance
  rebalanceThresholdPercent: number; // Drift threshold (1-50%)
  swapSlippageBps: number; // Swap slippage (1-5000 bps)
  bridgeSlippageBps: number; // Bridge slippage (1-5000 bps)
  maxGasPrice?: string; // Optional gas price limit
  dryRun: boolean; // Simulation mode
  minRebalanceAmount: string; // Minimum USD to trigger
  maxRebalanceAmount?: string; // Maximum USD per operation
}
```

### Response Data

```typescript
interface ExecuteResponse {
  rebalanceComplete: boolean;
  executedActions: ExecutedAction[];
  finalAllocations: CurrentAllocation[];
  totalGasUsed: string;
  executionTimeSeconds: number;
}
```

## Error Handling

The tool provides comprehensive error handling:

- **Precheck Failures**: RPC connection issues, invalid parameters
- **Execution Failures**: Transaction failures, insufficient balance
- **Network Issues**: Chain connectivity problems, gas estimation errors

## Best Practices

1. **Start with Dry Runs**: Always test your configuration with `dryRun: true`
2. **Conservative Thresholds**: Start with 5-10% thresholds to avoid over-trading
3. **Monitor Gas Costs**: Set reasonable `maxGasPrice` limits
4. **Gradual Rebalancing**: Use `maxRebalanceAmount` to limit large movements
5. **Regular Monitoring**: Check portfolio status periodically

## Security Considerations

- **PKP Key Management**: Tool uses delegated PKP keys for execution
- **Slippage Protection**: Built-in slippage limits prevent MEV attacks
- **Transaction Simulation**: Dry run mode for safe testing
- **Gas Limit Checks**: Prevents excessive gas usage

## Examples

### Example 1: Simple ETH/USDC Rebalancing

```typescript
const ethUsdcRebalance = {
  targetAllocations: [
    { tokenSymbol: "ETH", tokenAddress: "0x0000000000000000000000000000000000000000", targetPercentage: 70, chain: "ethereum" },
    { tokenSymbol: "USDC", tokenAddress: "0xA0b86a33E6441E8Db5f9Bbf8F6bDbF1D8c6a6E8c", targetPercentage: 30, chain: "ethereum" }
  ],
  chainConfigs: [
    { chainId: "1", name: "ethereum", rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY" }
  ],
  strategy: "THRESHOLD",
  rebalanceThresholdPercent: 5
};
```

### Example 2: Multi-Chain Diversification

```typescript
const multiChainPortfolio = {
  targetAllocations: [
    { tokenSymbol: "ETH", tokenAddress: "0x0000000000000000000000000000000000000000", targetPercentage: 25, chain: "ethereum" },
    { tokenSymbol: "ETH", tokenAddress: "0x0000000000000000000000000000000000000000", targetPercentage: 25, chain: "base" },
    { tokenSymbol: "USDC", tokenAddress: "0xA0b86a33E6441E8Db5f9Bbf8F6bDbF1D8c6a6E8c", targetPercentage: 25, chain: "ethereum" },
    { tokenSymbol: "USDC", tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", targetPercentage: 25, chain: "base" }
  ],
  // ... chain configs for both Ethereum and Base
  strategy: "THRESHOLD",
  rebalanceThresholdPercent: 3
};
```

## Contributing

This tool is part of the Vincent SDK ecosystem. For issues or contributions, please refer to the main Vincent SDK repository.

## License

MIT License - see LICENSE file for details.