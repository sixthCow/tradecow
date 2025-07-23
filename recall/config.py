"""
Configuration and constants for the Bitcoin Maximalist Trading Agent
"""

from dataclasses import dataclass
from typing import Dict

@dataclass
class ChainConfig:
    """Configuration for each supported chain"""
    name: str
    chain_id: str
    specific_chain: str
    target_allocation: float  # Percentage of total WBTC to hold on this chain

@dataclass
class TokenBalance:
    """Token balance information"""
    token: str
    symbol: str
    amount: float
    price: float
    value: float
    chain: str

class Config:
    """Agent configuration constants"""
    
    # Token addresses (mainnet addresses work in sandbox)
    TOKENS = {
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
    }
    
    # Chain configurations with target allocations
    CHAINS = {
        "ethereum": ChainConfig("Ethereum", "evm", "eth", 0.40),
        "arbitrum": ChainConfig("Arbitrum", "evm", "arbitrum", 0.25),
        "optimism": ChainConfig("Optimism", "evm", "optimism", 0.20),
        "base": ChainConfig("Base", "evm", "base", 0.15)
    }
    
    # Trading parameters
    REBALANCE_THRESHOLD = 0.05  # 5% drift threshold
    MIN_TRADE_VALUE = 10        # Minimum $10 trade to avoid dust
    TRADE_DELAY = 2             # Seconds between trades
    SETTLE_DELAY = 10           # Seconds to wait for trades to settle
    
    # API endpoints
    SANDBOX_URL = "https://api.sandbox.competitions.recall.network"
    PRODUCTION_URL = "https://api.competitions.recall.network"