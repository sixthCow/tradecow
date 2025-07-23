# Vincent DCA/Limit Order Tool

A comprehensive Dollar-Cost Averaging (DCA) and Limit Order tool for automated trading strategies, built for the Vincent Scaffold SDK and Lit Actions execution environment.

## Overview

The DCA/Limit Order tool enables users to execute automated trading strategies without constant manual intervention:

- **Dollar-Cost Averaging (DCA)**: Execute recurring purchases at regular intervals (daily, weekly, bi-weekly, monthly)
- **Limit Orders**: Execute trades when specific price conditions are met
- **Cross-DEX Support**: Leverages 1inch aggregation for optimal swap routing
- **Price Monitoring**: Real-time price checking for limit order execution
- **Time-Based Execution**: Automated scheduling for DCA orders

## Supported Order Types

### DCA (Dollar-Cost Averaging)
- **Purpose**: Reduce timing risk by spreading purchases over time
- **Execution**: Time-based recurring purchases
- **Parameters**: frequency, totalExecutions, nextExecutionTime
- **Use Case**: "Buy $50 worth of ETH with USDC every Monday"

### LIMIT Orders
- **Purpose**: Execute trades at specific price targets
- **Execution**: Price-condition based execution
- **Parameters**: targetPrice, condition, expirationTime
- **Use Case**: "Sell 0.1 WBTC if its price reaches $70,000"

## Usage Examples

### DCA Order Example

```typescript
import { getVincentToolClient } from "@lit-protocol/vincent-app-sdk";
import { bundledVincentTool as dcaLimitTool } from "@lit-protocol/vincent-tool-dca-limit-order";

const dcaToolClient = getVincentToolClient({
  bundledVincentTool: dcaLimitTool,
  ethersSigner: yourSigner,
});

// Set up weekly USDC -> ETH DCA
const dcaParams = {
  orderType: "DCA",
  fromTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  toTokenAddress: "0x4200000000000000000000000000000000000006",   // WETH on Base
  amount: "50.0", // $50 USDC each execution
  chain: "base",
  frequency: "WEEKLY",
  totalExecutions: 10, // Run for 10 weeks
  nextExecutionTime: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // Next Monday
  slippageBps: 100, // 1% slippage tolerance
  rpcUrl: baseRpcUrl,
};

// Check if DCA should execute
const precheckResult = await dcaToolClient.precheck(dcaParams, {
  delegatorPkpEthAddress: pkpAddress,
});

if (precheckResult.success && precheckResult.result.conditionMet) {
  // Execute the DCA purchase
  const executeResult = await dcaToolClient.execute(dcaParams, {
    delegatorPkpEthAddress: pkpAddress,
  });
  
  console.log("DCA executed:", executeResult.result.txHash);
  console.log("Next execution:", executeResult.result.nextExecutionTime);
  console.log("Executions remaining:", executeResult.result.executionsRemaining);
}
```

### Limit Order Example

```typescript
// Set up limit order to sell ETH when price reaches $4000
const limitParams = {
  orderType: "LIMIT",
  fromTokenAddress: "0x4200000000000000000000000000000000000006", // WETH on Base
  toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // USDC on Base
  amount: "0.1", // 0.1 ETH
  chain: "base",
  targetPrice: "4000.0", // $4000 per ETH
  condition: "GREATER_THAN", // Execute when price >= $4000
  expirationTime: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // Expires in 30 days
  slippageBps: 200, // 2% slippage tolerance
  rpcUrl: baseRpcUrl,
};

// Check if limit order conditions are met
const limitPrecheckResult = await dcaToolClient.precheck(limitParams, {
  delegatorPkpEthAddress: pkpAddress,
});

if (limitPrecheckResult.success) {
  console.log("Current price:", limitPrecheckResult.result.currentPrice);
  console.log("Target price:", limitPrecheckResult.result.targetPrice);
  console.log("Should execute:", limitPrecheckResult.result.conditionMet);
  
  if (limitPrecheckResult.result.conditionMet) {
    // Execute the limit order
    const limitExecuteResult = await dcaToolClient.execute(limitParams, {
      delegatorPkpEthAddress: pkpAddress,
    });
    
    console.log("Limit order executed:", limitExecuteResult.result.txHash);
    console.log("Execution price:", limitExecuteResult.result.executionPrice);
  }
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderType` | `"DCA" \| "LIMIT"` | ✅ | Type of order to execute |
| `fromTokenAddress` | `string` | ✅ | Source token contract address |
| `toTokenAddress` | `string` | ✅ | Destination token contract address |
| `amount` | `string` | ✅ | Amount to trade per execution |
| `chain` | `string` | ✅ | Blockchain network ("base", "arbitrum", etc.) |
| `slippageBps` | `number` | ❌ | Slippage tolerance in basis points (default: 100 = 1%) |
| `rpcUrl` | `string` | ❌ | Custom RPC URL (required for precheck) |

### DCA-Specific Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `frequency` | `"DAILY" \| "WEEKLY" \| "BIWEEKLY" \| "MONTHLY"` | ✅ | Execution frequency |
| `totalExecutions` | `number` | ✅ | Total number of executions (1-1000) |
| `nextExecutionTime` | `number` | ✅ | Unix timestamp for next execution |

### Limit Order-Specific Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetPrice` | `string` | ✅ | Target price to trigger execution |
| `condition` | `"GREATER_THAN" \| "LESS_THAN"` | ✅ | Price condition for execution |
| `expirationTime` | `number` | ✅ | Unix timestamp when order expires |

## Supported Networks

- **Mainnets**: Ethereum, Polygon, Avalanche, Arbitrum, Optimism, Base, Fantom, BNB, Gnosis, Scroll, Metis, Linea, zkSync
- **Testnets**: Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Avalanche Fuji, Scroll Sepolia

## Key Features

### Advanced Order Management
- **Condition Checking**: Real-time validation of execution conditions
- **Balance Verification**: Ensures sufficient funds before execution
- **Allowance Validation**: Checks token approvals for ERC-20 trades
- **Price Monitoring**: Fetches current market prices for limit orders
- **Expiration Handling**: Prevents execution of expired orders

### DEX Integration
- **1inch Aggregation**: Optimal routing across multiple DEXs
- **Price Impact Calculation**: Estimates trading costs
- **Gas Estimation**: Pre-validates transaction requirements
- **Multi-Protocol Support**: Access to 80+ liquidity sources

### Automation Features
- **Time-Based Execution**: Automated scheduling for DCA orders
- **Price-Based Execution**: Conditional execution for limit orders
- **Order Tracking**: Unique order IDs for state management
- **Execution History**: Detailed transaction records

## Prerequisites

### Token Approvals
Before executing orders with ERC-20 tokens, approve the DEX router contract using the Vincent ERC-20 approval tool:

```typescript
await client.execute('approve', {
  chainId: chainId,
  tokenAddress: fromTokenAddress,
  spenderAddress: routerAddress, // From precheck result
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
npm run vincent:e2e:dca-limit-order

# Reset test state
npm run vincent:e2e:reset
```

## Error Handling

The tool includes comprehensive validation:

- **Parameter Validation**: Validates all order parameters based on type
- **Balance Checks**: Verifies sufficient token balance before execution
- **Allowance Validation**: Ensures proper token approvals
- **Price Validation**: Checks current prices for limit orders
- **Expiration Checks**: Prevents execution of expired orders
- **Gas Estimation**: Pre-validates transaction gas requirements

## API Integration

The tool integrates with external APIs for:
- **1inch API**: Real-time quotes and optimal swap routing
- **Price Feeds**: Current market prices for condition checking
- **DEX Aggregation**: Access to multiple liquidity sources

## Example Responses

### Precheck Success (DCA)
```json
{
  "success": true,
  "result": {
    "orderValid": true,
    "conditionMet": true,
    "userBalance": "1000000000",
    "nextExecutionTime": 1642680000,
    "executionsRemaining": 10,
    "dexQuote": {
      "estimatedOutput": "999500000000000000",
      "priceImpact": "0.05",
      "dexName": "Uniswap_V3",
      "routerAddress": "0x..."
    }
  }
}
```

### Execute Success (Limit Order)
```json
{
  "success": true,
  "result": {
    "txHash": "0x...",
    "orderType": "LIMIT",
    "fromTokenAddress": "0x...",
    "toTokenAddress": "0x...",
    "executedAmount": "100000000000000000",
    "receivedAmount": "4000000000",
    "executionPrice": "4000.0",
    "timestamp": 1642680000,
    "orderId": "0x12345678",
    "dexUsed": "Uniswap_V3"
  }
}
```

## Architecture Notes

- Built on Vincent Scaffold SDK framework
- Executes in Lit Actions environment with Node.js constraints
- Uses Zod schemas for runtime validation
- Integrates with PKP (Programmable Key Pair) wallets
- Leverages existing DEX Aggregator tool for swap execution
- Schema-first development approach

## Security Considerations

- All parameters are validated before execution
- Orders can only be executed when conditions are met
- Expiration times prevent indefinite order execution
- Token approvals are verified before each trade
- All transactions are signed within the secure Lit Actions environment