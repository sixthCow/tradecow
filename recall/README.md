# Bitcoin Maximalist Trading Agent

A  Bitcoin maximalist strategy by converting all assets to WBTC (Wrapped Bitcoin) and maintaining optimal cross-chain distribution.

## Strategy Overview

The Bitcoin Maximalist Agent follows a two-step strategy:

1. **Conversion to WBTC**: Converts all assets (USDC, USDbC, SOL, etc.) to WBTC on Ethereum mainnet using cross-chain trades
2. **Chain Distribution**: Maintains a balanced WBTC distribution across multiple chains according to configured allocations:
   - Ethereum: 40%
   - Arbitrum: 25%
   - Optimism: 20%
   - Base: 15%

## Features

- Cross-chain trading support (EVM chains and Solana)
- Automatic dust handling to avoid small trades
- Configurable rebalancing thresholds
- Detailed portfolio analytics and logging
- Support for sandbox and production environments

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```
3. Copy `.env.example` to `.env` and configure your API key:
```bash
RECALL_API_KEY=your_api_key_here
```

## Usage

### Run the Strategy

```bash
python run_agent.py run --save
```

### Check Portfolio Status

```bash
python run_agent.py status
```

### View Detailed Portfolio

```bash
python run_agent.py portfolio
```

### Test Trading Functions

```bash
python test_trade.py
```

## Configuration

Key parameters can be configured in `.env`:

- `BTC_REBALANCE_THRESHOLD`: Drift threshold before rebalancing (default: 5%)
- `BTC_MIN_TRADE_VALUE`: Minimum trade value to avoid dust (default: $10)
- `BTC_TARGET_*`: Target allocations for each chain

## Architecture

- `btc_agent.py`: Main agent orchestration
- `trading_engine.py`: Core trading logic
- `api_client.py`: Recall API interactions
- `token_detector.py`: Token and chain detection
- `config.py`: Configuration and constants
