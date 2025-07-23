"""
API client for Recall Network trading operations
"""

import requests
import time
from typing import Dict
import logging

logger = logging.getLogger(__name__)

class RecallAPIClient:
    """Handles all API interactions with Recall Network"""
    
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        })
    
    def get_portfolio(self) -> Dict:
        """Get current portfolio from Recall API"""
        try:
            response = self.session.get(f"{self.base_url}/api/agent/portfolio")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to get portfolio: {e}")
            raise
    
    def get_token_price(self, token_address: str, chain: str = "evm", 
                       specific_chain: str = "eth") -> float:
        """Get current token price"""
        try:
            params = {
                "token": token_address,
                "chain": chain,
                "specificChain": specific_chain
            }
            response = self.session.get(f"{self.base_url}/api/price", params=params)
            response.raise_for_status()
            return response.json()["price"]
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to get price for {token_address}: {e}")
            return 0.0
    
    def execute_trade(self, from_token: str, to_token: str, amount: str, 
                     from_chain: str = "evm", to_chain: str = "evm",
                     from_specific: str = "eth", to_specific: str = "eth",
                     reason: str = "BTC maximalist trade") -> Dict:
        """Execute a trade on Recall"""
        trade_payload = {
            "fromToken": from_token,
            "toToken": to_token,
            "amount": amount,
            "fromChain": from_chain,
            "toChain": to_chain,
            "fromSpecificChain": from_specific,
            "toSpecificChain": to_specific,
            "reason": reason
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/trade/execute", 
                                       json=trade_payload)
            response.raise_for_status()
            result = response.json()
            
            logger.info(f"✅ Trade executed: {amount} {from_token[:6]}... → {to_token[:6]}...")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Trade failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response: {e.response.text}")
            raise