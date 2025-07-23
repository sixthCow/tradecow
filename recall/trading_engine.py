"""
Trading logic for Bitcoin Maximalist strategy
"""

import time
from typing import Dict, List
import logging
from config import Config
from api_client import RecallAPIClient

logger = logging.getLogger(__name__)

class TradingEngine:
    """Handles token conversion and rebalancing trades"""
    
    def __init__(self, api_client: RecallAPIClient):
        self.api = api_client
    
    def convert_to_wbtc(self, portfolio: Dict) -> List[Dict]:
        """Convert all non-WBTC tokens to WBTC"""
        trades_executed = []
        
        if not portfolio.get("tokens"):
            logger.warning("⚠️ No tokens found in portfolio")
            return trades_executed
        
        wbtc_price = self.api.get_token_price(Config.TOKENS["WBTC"])
        if wbtc_price == 0:
            logger.error("❌ Cannot get WBTC price, skipping conversion")
            return trades_executed
        
        for token_info in portfolio["tokens"]:
            token_address = token_info["token"]
            amount = token_info["amount"]
            value = token_info["value"]
            
            # Skip WBTC tokens
            if token_address.lower() == Config.TOKENS["WBTC"].lower():
                logger.info(f"💰 Keeping {amount:.6f} WBTC (${value:.2f})")
                continue
            
            # Skip small positions to avoid dust
            if value < Config.MIN_TRADE_VALUE:
                logger.info(f"⏭️ Skipping dust position: ${value:.2f}")
                continue
            
            # Determine token symbol for logging
            symbol = self._get_token_symbol(token_address)
            logger.info(f"🔄 Converting {amount:.6f} {symbol} (${value:.2f}) to WBTC")
            
            try:
                trade_result = self.api.execute_trade(
                    from_token=token_address,
                    to_token=Config.TOKENS["WBTC"],
                    amount=str(amount),
                    reason=f"Convert {symbol} to WBTC - BTC maximalist strategy"
                )
                trades_executed.append(trade_result)
                time.sleep(Config.TRADE_DELAY)
                
            except Exception as e:
                logger.error(f"❌ Failed to convert {symbol} to WBTC: {e}")
                continue
        
        return trades_executed
    
    def execute_rebalance_trades(self, trades_needed: List[Dict]) -> List[Dict]:
        """Execute cross-chain rebalance trades"""
        trades_executed = []
        
        for trade in trades_needed:
            try:
                if trade["action"] == "sell":
                    # Sell WBTC for USDC on over-allocated chain
                    wbtc_amount = abs(trade["value_diff"]) / self.api.get_token_price(Config.TOKENS["WBTC"])
                    
                    trade_result = self.api.execute_trade(
                        from_token=Config.TOKENS["WBTC"],
                        to_token=Config.TOKENS["USDC"],
                        amount=str(wbtc_amount),
                        from_specific=trade["chain"],
                        to_specific=trade["chain"],
                        reason=f"Rebalance: Reduce WBTC on {trade['chain_name']}"
                    )
                    trades_executed.append(trade_result)
                    
                elif trade["action"] == "buy":
                    # This would require USDC balance on target chain
                    logger.info(f"📝 Need to buy ${abs(trade['value_diff']):.2f} WBTC on {trade['chain_name']}")
                
                time.sleep(Config.TRADE_DELAY)
                
            except Exception as e:
                logger.error(f"❌ Failed to execute rebalance trade for {trade['chain_name']}: {e}")
                continue
        
        return trades_executed
    
    def _get_token_symbol(self, token_address: str) -> str:
        """Get token symbol from address"""
        for symbol, address in Config.TOKENS.items():
            if address.lower() == token_address.lower():
                return symbol
        return "UNKNOWN"