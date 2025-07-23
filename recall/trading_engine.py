"""
Trading logic for Bitcoin Maximalist strategy
"""

import time
from typing import Dict, List
import logging
from config import Config
from api_client import RecallAPIClient
from token_detector import MultiChainTokenDetector

logger = logging.getLogger(__name__)

class TradingEngine:
    """Handles token conversion and rebalancing trades"""
    
    def __init__(self, api_client: RecallAPIClient):
        self.api = api_client
        self.detector = MultiChainTokenDetector()
    
    def convert_to_wbtc(self, portfolio: Dict) -> List[Dict]:
        """Convert all non-WBTC tokens to WBTC on Ethereum using cross-chain trades"""
        trades_executed = []
        
        if not portfolio.get("tokens"):
            logger.warning("No tokens found in portfolio")
            return trades_executed
        
        # Always target WBTC on Ethereum
        target_wbtc_address = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
        to_chain = "evm"
        to_specific = "eth"
        
        for token_info in portfolio["tokens"]:
            token_address = token_info["token"]
            amount = token_info["amount"]
            value = token_info["value"]
            
            # Use API-provided symbol and chain info
            symbol = token_info.get("symbol", "UNKNOWN")
            specific_chain = token_info.get("specificChain", "eth")
            chain_type = token_info.get("chain_type", token_info.get("chain", "evm"))
            
            # Skip WBTC tokens on any chain
            if symbol == "WBTC" or self.detector.is_wbtc_address(token_address):
                logger.info(f"Keeping {amount:.6f} WBTC (${value:.2f}) on {specific_chain}")
                continue
            
            # Skip small positions to avoid dust
            if value < Config.MIN_TRADE_VALUE:
                logger.info(f"Skipping dust position: ${value:.2f} {symbol}")
                continue
            
            # Skip zero amounts
            if amount <= 0:
                logger.info(f"Skipping zero balance: {symbol} on {specific_chain}")
                continue
            
            logger.info(f"Converting {amount:.6f} {symbol} (${value:.2f}) from {specific_chain} to WBTC on Ethereum")
            
            try:
                # Simple chain detection: only Solana uses "svm", everything else is "evm"
                if specific_chain == "svm" or chain_type == "svm":
                    from_chain = "svm"
                    from_specific = "svm"
                else:
                    from_chain = "evm"
                    from_specific = specific_chain
                
                trade_result = self.api.execute_trade(
                    from_token=token_address,
                    to_token=target_wbtc_address,
                    amount=str(amount),
                    from_chain=from_chain,
                    from_specific=from_specific,
                    to_chain=to_chain,
                    to_specific=to_specific,
                    reason=f"Convert {symbol} to WBTC - BTC maximalist strategy"
                )
                trades_executed.append(trade_result)
                time.sleep(Config.TRADE_DELAY)
                
            except Exception as e:
                logger.error(f"Failed to convert {symbol} to WBTC: {e}")
                continue
        
        return trades_executed
    
    def execute_rebalance_trades(self, trades_needed: List[Dict]) -> List[Dict]:
        """Execute cross-chain rebalance trades"""
        trades_executed = []
        
        logger.info("Note: Cross-chain rebalancing requires complex bridge operations")
        logger.info("For now, logging rebalancing intentions...")
        
        for trade in trades_needed:
            try:
                if trade["action"] == "sell":
                    logger.info(f"Would sell ${abs(trade['value_diff']):.2f} WBTC from {trade['chain_name']}")
                elif trade["action"] == "buy":
                    logger.info(f"Would buy ${abs(trade['value_diff']):.2f} WBTC on {trade['chain_name']}")
                
                time.sleep(Config.TRADE_DELAY)
                
            except Exception as e:
                logger.error(f"Failed to execute rebalance trade for {trade['chain_name']}: {e}")
                continue
        
        return trades_executed