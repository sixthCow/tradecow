# Vincent DEX Aggregator Tool

A comprehensive DEX aggregation tool for finding and executing optimal token swaps across multiple decentralized exchanges, built for the Vincent Scaffold SDK and Lit Actions execution environment.

## Overview

The DEX Aggregator tool automatically finds the best swap rates across various decentralized exchanges (DEXs) and executes trades to maximize output while minimizing costs. It integrates with the 1inch API to aggregate liquidity from multiple sources and provide optimal routing.

## Supported Operations

- **Token Swaps** - Exchange one token for another at the best available rate
- **Multi-DEX Routing** - Automatically routes through multiple DEXs for optimal pricing
- **Slippage Protection** - Configurable slippage tolerance to protect against unfavorable price movements
- **Gas Optimization** - Considers gas costs in route optimization

## Usage Examples

### Basic Token Swap

```typescript
import { VincentClient } from '@lit-protocol/vincent-sdk';

const client = new VincentClient();
await client.registerTool('./vincent-packages/tools/dex-aggregator');

// Swap 1 WETH for USDC on Base
await client.execute('dex-aggregator', {
  fromTokenAddress: "0x4200000000000000000000000000000000000006", // WETH on Base
  toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  amount: "1.0",
  chain: "base",
  slippageBps: 100 // 1% slippage tolerance
});
```

### Complete Workflow with Approval

```typescript
// 1. First approve the token for the DEX router (if needed)
await client.execute('approve', {
  chainId: 8453,
  tokenAddress: "0x4200000000000000000000000000000000000006", // WETH
  spenderAddress: "0x111111125421cA6dc452d289314280a0f8842A65", // 1inch router
  tokenAmount: 1.0,
  tokenDecimals: 18
});

// 2. Execute the swap
await client.execute('dex-aggregator', {
  fromTokenAddress: "0x4200000000000000000000000000000000000006",
  toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "1.0",
  chain: "base",
  slippageBps: 100
});
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromTokenAddress` | `string` | ✅ | Source token contract address (0x format) |
| `toTokenAddress` | `string` | ✅ | Destination token contract address (0x format) |
| `amount` | `string` | ✅ | Amount to swap as string (e.g., "1.5") |
| `chain` | `string` | ✅ | Chain identifier ("ethereum", "base", "arbitrum", etc.) |
| `slippageBps` | `number` | ❌ | Slippage tolerance in basis points (default: 100 = 1%) |
| `rpcUrl` | `string` | ❌ | Custom RPC URL (for precheck validation only) |

## Supported Networks

- **Ethereum** (Chain ID: 1)
- **Base** (Chain ID: 8453)
- **Arbitrum** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Polygon** (Chain ID: 137)
- **BSC** (Chain ID: 56)
- **Avalanche** (Chain ID: 43114)

## Key Features

### Optimal Route Finding
- Aggregates quotes from multiple DEXs via 1inch API
- Considers gas costs in optimization
- Supports multi-hop swaps for better rates
- Real-time price discovery

### Security & Validation
- Comprehensive balance and allowance checks
- Slippage protection
- Address validation
- Gas estimation with safety buffers

### Integration Benefits
- Seamless integration with existing Vincent tools
- PKP-secured transaction signing
- Decentralized execution via Lit Actions
- Policy support for additional controls

## Prerequisites

### Token Approvals
Before swapping ERC-20 tokens, they must be approved for the DEX router contract. Use the Vincent approve tool:

```typescript
await client.execute('approve', {
  chainId: chainId,
  tokenAddress: fromTokenAddress,
  spenderAddress: routerAddress, // Obtained from precheck
  tokenAmount: amount,
  tokenDecimals: decimals
});
```

### Environment Setup
```bash
# Configure RPC URLs for supported chains
BASE_RPC_URL=your_base_rpc_url_here
ARBITRUM_RPC_URL=your_arbitrum_rpc_url_here
# ... other chain RPC URLs
```

## Development Commands

```bash
# Build the tool
npm run build

# Build all tools and policies
npm run vincent:build

# Run E2E tests
npm run vincent:e2e:dex-aggregator

# Reset test state
npm run vincent:e2e:reset
```

## Error Handling

The tool includes comprehensive validation:

- **Balance Checks**: Verifies sufficient token balance before swaps
- **Allowance Validation**: Ensures proper token approvals for ERC-20 tokens
- **Price Impact Protection**: Warns about high price impact trades
- **Gas Estimation**: Pre-validates transaction gas requirements
- **Route Validation**: Ensures viable swap routes exist

## API Integration

The tool integrates with the 1inch API for:
- Real-time price quotes
- Optimal route discovery
- Transaction data generation
- Multi-DEX aggregation

## Example Responses

### Precheck Success
```json
{
  "fromTokenAddress": "0x4200000000000000000000000000000000000006",
  "toTokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "fromAmount": "1000000000000000000",
  "estimatedToAmount": "2500000000",
  "routerAddress": "0x111111125421cA6dc452d289314280a0f8842A65",
  "estimatedGas": 150000,
  "priceImpact": "0.12",
  "dexName": "Uniswap V3",
  "route": ["Uniswap V3"]
}
```

### Execute Success
```json
{
  "txHash": "0xabc123...",
  "fromTokenAddress": "0x4200000000000000000000000000000000000006",
  "toTokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "fromAmount": "1000000000000000000",
  "estimatedToAmount": "2500000000",
  "dexName": "Uniswap V3",
  "timestamp": 1703123456789
}
```

## Testing

The tool includes comprehensive E2E tests covering:
- Successful swaps across different token pairs
- Balance and allowance validation
- Error handling for insufficient funds
- Multi-chain functionality
- Gas estimation accuracy

## Architecture Notes

- Built on Vincent Scaffold SDK framework
- Executes in Lit Actions environment with Node.js constraints
- Uses Zod schemas for runtime validation
- Integrates with PKP (Programmable Key Pair) wallets
- Schema-first development approach
- Follows existing component patterns in `vincent-packages/`