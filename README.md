# TradeCow Project Overview

This project contains multiple components for cryptocurrency trading and DeFi operations:

## 📈 Bitcoin Maximalist Trading Agent
A trading agent that implements a Bitcoin maximalist strategy by converting all assets to WBTC and maintaining optimal cross-chain distribution.

**Key Features:**
- Cross-chain trading support (EVM chains and Solana)
- Automated portfolio rebalancing
- Configurable thresholds and allocations
- Detailed analytics and logging

[Learn more about the Bitcoin Maximalist Agent](./recall/README.md)

## 🔧 Vincent DeFi Tools
A collection of sophisticated DeFi tools built on the Vincent Scaffold SDK for secure, decentralized finance operations:

### Portfolio Rebalancer
Automatically rebalances cryptocurrency portfolios across multiple blockchains using DeBridge for transfers and DEX aggregation.
- Multi-chain support
- Intelligent rebalancing strategies
- Gas optimization
- Comprehensive validation

[Lit Explorer](https://explorer.litprotocol.com/ipfs/QmcnGvKG3eTGmG8rwo3o6YKWMCo4GLApo5Ne9nAx1sXvMx)

[Learn more about Portfolio Rebalancer](./VincentDeFiTools/vincent-packages/tools/portfolio-rebalancer/README.md)

### DEX Aggregator
Finds and executes optimal token swaps across multiple decentralized exchanges.
- Best price routing
- Slippage protection
- Multi-DEX integration
- Real-time price discovery

[Lit Explorer](https://explorer.litprotocol.com/ipfs/QmRBZJVLSTy7gV7BuwAxLpst67ui2JbiePRDr1K7N61U8B)

[Learn more about DEX Aggregator](./VincentDeFiTools/vincent-packages/tools/dex-aggregator/README.md)

### DCA/Limit Order Tool
Enables automated Dollar-Cost Averaging and limit order execution.
- Time-based DCA execution
- Price-based limit orders
- Cross-DEX support
- Automated scheduling

[Lit Explorer](https://explorer.litprotocol.com/ipfs/QmdVEkCnChC2UihAGhEfQbcAtQCcVC3pU2RQhJQGXAqJUa)

[Learn more about DCA/Limit Orders](./VincentDeFiTools/vincent-packages/tools/dca-limit-order/README.md)

