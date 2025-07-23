#!/usr/bin/env python3
"""
Bitcoin Maximalist Trading Agent for Recall Network
==================================================

Main agent orchestrating the BTC maximalist strategy.
"""

import os
import time
import json
import logging
from typing import Dict
from datetime import datetime

from config import Config
from api_client import RecallAPIClient
from trading_engine import TradingEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('btc_agent.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class PortfolioAnalyzer:
    """Analyzes portfolio distribution and calculates rebalancing needs"""
    
    @staticmethod
    def analyze_chain_distribution(portfolio: Dict) -> Dict[str, float]:
        """Analyze current WBTC distribution across chains"""
        chain_values = {}
        total_wbtc_value = 0
        
        for token_info in portfolio.get("tokens", []):
            if token_info["token"].lower() == Config.TOKENS["WBTC"].lower():
                chain = token_info.get("chain", "ethereum")
                value = token_info["value"]
                
                if chain not in chain_values:
                    chain_values[chain] = 0
                chain_values[chain] += value
                total_wbtc_value += value
        
        # Calculate percentages
        chain_percentages = {}
        if total_wbtc_value > 0:
            for chain, value in chain_values.items():
                chain_percentages[chain] = value / total_wbtc_value
        
        logger.info(f"📊 Current WBTC distribution: {chain_percentages}")
        return chain_percentages
    
    @staticmethod
    def calculate_rebalance_trades(current_distribution: Dict[str, float], 
                                 total_wbtc_value: float) -> list:
        """Calculate trades needed to rebalance across chains"""
        trades_needed = []
        
        for chain_key, chain_config in Config.CHAINS.items():
            current_pct = current_distribution.get(chain_config.specific_chain, 0)
            target_pct = chain_config.target_allocation
            drift = abs(current_pct - target_pct)
            
            if drift > Config.REBALANCE_THRESHOLD:
                current_value = current_pct * total_wbtc_value
                target_value = target_pct * total_wbtc_value
                value_diff = target_value - current_value
                
                if abs(value_diff) > Config.MIN_TRADE_VALUE:
                    trades_needed.append({
                        "chain": chain_config.specific_chain,
                        "chain_name": chain_config.name,
                        "current_pct": current_pct,
                        "target_pct": target_pct,
                        "drift": drift,
                        "value_diff": value_diff,
                        "action": "buy" if value_diff > 0 else "sell"
                    })
                    
                    logger.info(f"🎯 {chain_config.name}: {current_pct*100:.1f}% → {target_pct*100:.1f}% "
                              f"({'⬆️' if value_diff > 0 else '⬇️'} ${abs(value_diff):.2f})")
        
        return trades_needed

class BitcoinMaximalistAgent:
    """Main Bitcoin Maximalist Trading Agent"""
    
    def __init__(self, api_key: str, base_url: str = None):
        """Initialize the Bitcoin Maximalist Agent"""
        self.base_url = base_url or Config.SANDBOX_URL
        self.api = RecallAPIClient(api_key, self.base_url)
        self.trading = TradingEngine(self.api)
        self.analyzer = PortfolioAnalyzer()
        
        logger.info("🚀 Bitcoin Maximalist Agent initialized")
        logger.info(f"📊 Target allocations: {[f'{c.name}: {c.target_allocation*100:.0f}%' for c in Config.CHAINS.values()]}")
    
    def run_strategy(self) -> Dict:
        """Execute the complete Bitcoin maximalist strategy"""
        logger.info("🟡 Starting Bitcoin Maximalist Strategy Execution")
        
        try:
            # Step 1: Get current portfolio
            logger.info("📊 Fetching current portfolio...")
            portfolio = self.api.get_portfolio()
            initial_value = portfolio.get("totalValue", 0)
            logger.info(f"💰 Total portfolio value: ${initial_value:.2f}")
            
            # Step 2: Convert all tokens to WBTC
            logger.info("🔄 Converting all holdings to WBTC...")
            conversion_trades = self.trading.convert_to_wbtc(portfolio)
            
            # Wait for trades to settle
            if conversion_trades:
                logger.info("⏳ Waiting for conversion trades to settle...")
                time.sleep(Config.SETTLE_DELAY)
            
            # Step 3: Get updated portfolio and analyze distribution
            updated_portfolio = self.api.get_portfolio()
            current_distribution = self.analyzer.analyze_chain_distribution(updated_portfolio)
            
            total_wbtc_value = sum([
                token["value"] for token in updated_portfolio.get("tokens", [])
                if token["token"].lower() == Config.TOKENS["WBTC"].lower()
            ])
            
            # Step 4: Execute rebalancing if needed
            rebalance_trades = []
            if total_wbtc_value > 0:
                trades_needed = self.analyzer.calculate_rebalance_trades(current_distribution, total_wbtc_value)
                if trades_needed:
                    logger.info(f"🔄 Executing {len(trades_needed)} rebalance trades...")
                    rebalance_trades = self.trading.execute_rebalance_trades(trades_needed)
                else:
                    logger.info("✅ Portfolio already balanced within threshold")
            
            # Step 5: Final results
            final_portfolio = self.api.get_portfolio()
            final_value = final_portfolio.get("totalValue", 0)
            
            result = {
                "initial_value": initial_value,
                "final_value": final_value,
                "value_change": final_value - initial_value,
                "conversion_trades": len(conversion_trades),
                "rebalance_trades": len(rebalance_trades),
                "final_distribution": self.analyzer.analyze_chain_distribution(final_portfolio),
                "timestamp": datetime.now().isoformat()
            }
            
            logger.info("🎉 Strategy execution completed successfully!")
            logger.info(f"📈 Portfolio value: ${initial_value:.2f} → ${final_value:.2f} "
                       f"({final_value - initial_value:+.2f})")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Strategy execution failed: {e}")
            raise
    
    def get_status(self) -> Dict:
        """Get current agent status and portfolio breakdown"""
        try:
            portfolio = self.api.get_portfolio()
            chain_distribution = self.analyzer.analyze_chain_distribution(portfolio)
            
            wbtc_tokens = [
                token for token in portfolio.get("tokens", [])
                if token["token"].lower() == Config.TOKENS["WBTC"].lower()
            ]
            
            total_wbtc_amount = sum(token["amount"] for token in wbtc_tokens)
            total_wbtc_value = sum(token["value"] for token in wbtc_tokens)
            
            return {
                "total_portfolio_value": portfolio.get("totalValue", 0),
                "wbtc_amount": total_wbtc_amount,
                "wbtc_value": total_wbtc_value,
                "wbtc_percentage": (total_wbtc_value / portfolio.get("totalValue", 1)) * 100,
                "chain_distribution": chain_distribution,
                "target_distribution": {
                    config.specific_chain: config.target_allocation 
                    for config in Config.CHAINS.values()
                },
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get status: {e}")
            return {"error": str(e)}

def main():
    """Main execution function"""
    api_key = os.getenv("RECALL_API_KEY")
    if not api_key:
        logger.error("❌ RECALL_API_KEY environment variable not set")
        return
    
    agent = BitcoinMaximalistAgent(api_key)
    
    try:
        result = agent.run_strategy()
        
        # Save results
        with open(f"btc_agent_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", "w") as f:
            json.dump(result, f, indent=2)
        
        logger.info("📝 Results saved to file")
        
    except KeyboardInterrupt:
        logger.info("⏹️ Strategy execution interrupted by user")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")

if __name__ == "__main__":
    main()