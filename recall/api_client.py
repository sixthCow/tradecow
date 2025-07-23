"""
API client for Recall Network trading operations
"""

import requests
import time
from typing import Dict, List
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
            logger.error(f"Failed to get portfolio: {e}")
            raise
    
    def get_balances(self) -> Dict:
        """Get detailed balances from Recall API with symbol and chain info"""
        try:
            response = self.session.get(f"{self.base_url}/api/agent/balances")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get balances: {e}")
            raise
    
    def get_enhanced_portfolio(self) -> Dict:
        """Get portfolio with enhanced token information from balances API"""
        try:
            # Get both portfolio and balances for complete picture
            portfolio = self.get_portfolio()
            balances = self.get_balances()
            
            # Create a mapping of tokenAddress -> balance info
            balance_lookup = {}
            if balances.get("success") and balances.get("balances"):
                for balance in balances["balances"]:
                    key = f"{balance['tokenAddress'].lower()}_{balance['specificChain']}"
                    balance_lookup[key] = balance
            
            # Enhance portfolio tokens with balance information
            enhanced_tokens = []
            for token in portfolio.get("tokens", []):
                token_address = token["token"].lower()
                # Try to find matching balance info
                enhanced_token = token.copy()
                
                # Look for exact match with chain info
                for key, balance_info in balance_lookup.items():
                    if balance_info["tokenAddress"].lower() == token_address:
                        enhanced_token.update({
                            "symbol": balance_info["symbol"],
                            "specificChain": balance_info["specificChain"],
                            "chain_type": balance_info["chain"]
                        })
                        break
                
                enhanced_tokens.append(enhanced_token)
            
            # Replace tokens in portfolio
            enhanced_portfolio = portfolio.copy()
            enhanced_portfolio["tokens"] = enhanced_tokens
            
            return enhanced_portfolio
            
        except Exception as e:
            logger.error(f"Failed to get enhanced portfolio: {e}")
            # Fallback to regular portfolio
            return self.get_portfolio()
    
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
            logger.error(f"Failed to get price for {token_address}: {e}")
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
            
            logger.info(f"Trade executed: {amount} {from_token[:6]}... -> {to_token[:6]}...")
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Trade failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_detail = e.response.json()
                    logger.error(f"Response: {error_detail}")
                except:
                    logger.error(f"Response: {e.response.text}")
            raise