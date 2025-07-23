"""
Configuration and constants for the Bitcoin Maximalist Trading Agent
"""

from dataclasses import dataclass
from typing import Dict
from token_detector import MultiChainTokenDetector

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
    
    # Use multi-chain token detector for addresses
    TOKENS = MultiChainTokenDetector.TOKEN_ADDRESSES
    
    # Chain configurations with target allocations
    CHAINS = {
        "ethereum": ChainConfig("Ethereum", "evm", "ethereum", 0.30),
        "arbitrum": ChainConfig("Arbitrum", "evm", "arbitrum", 0.25),
        "optimism": ChainConfig("Optimism", "evm", "optimism", 0.20),
        "base": ChainConfig("Base", "evm", "base", 0.15),
        "solana": ChainConfig("Solana", "svm", "solana", 0.10)  # Add Solana support
    }
    
    # Trading parameters
    REBALANCE_THRESHOLD = 0.05  # 5% drift threshold
    MIN_TRADE_VALUE = 10        # Minimum $10 trade to avoid dust
    TRADE_DELAY = 2             # Seconds between trades
    SETTLE_DELAY = 10           # Seconds to wait for trades to settle
    
    # API endpoints
    SANDBOX_URL = "https://api.sandbox.competitions.recall.network"
    PRODUCTION_URL = "https://api.competitions.recall.network"