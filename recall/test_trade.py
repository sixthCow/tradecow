#!/usr/bin/env python3
"""
Test script for simplified Bitcoin Maximalist Agent trading
"""

import os
from dotenv import load_dotenv
from api_client import RecallAPIClient
from config import Config

def test_cross_chain_trades():
    """Test cross-chain trades to WBTC on Ethereum"""
    load_dotenv()
    api_key = os.getenv("RECALL_API_KEY")
    
    if not api_key:
        print("ERROR: RECALL_API_KEY not found")
        return
    
    client = RecallAPIClient(api_key, Config.SANDBOX_URL)
    
    try:
        # Get current balances
        print("Getting current balances...")
        balances = client.get_balances()
        
        if balances.get("success"):
            print(f"Found {len(balances['balances'])} token balances:")
            for balance in balances["balances"]:
                if balance["amount"] > 0:
                    print(f"  {balance['symbol']}: {balance['amount']} on {balance['specificChain']}")
        
        print("\n" + "="*60)
        
        # Test USDbC on Base to WBTC on Ethereum (cross-chain)
        print("Testing USDbC on Base to WBTC on Ethereum...")
        
        trade_result = client.execute_trade(
            from_token="0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",  # USDbC on Base
            to_token="0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",     # WBTC on Ethereum
            amount="100.0",
            from_chain="evm",
            from_specific="base",
            to_chain="evm", 
            to_specific="eth",
            reason="Test cross-chain: USDbC Base -> WBTC Ethereum"
        )
        
        print("✅ Base -> Ethereum trade successful!")
        print(f"Result: {trade_result}")
        
        print("\n" + "-"*60)
        
        # Test USDC on Arbitrum to WBTC on Ethereum (cross-chain)
        print("Testing USDC on Arbitrum to WBTC on Ethereum...")
        
        trade_result = client.execute_trade(
            from_token="0xaf88d065e77c8cc2239327c5edb3a432268e5831",  # USDC on Arbitrum
            to_token="0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",     # WBTC on Ethereum
            amount="100.0",
            from_chain="evm",
            from_specific="arbitrum",
            to_chain="evm",
            to_specific="eth", 
            reason="Test cross-chain: USDC Arbitrum -> WBTC Ethereum"
        )
        
        print("✅ Arbitrum -> Ethereum trade successful!")
        print(f"Result: {trade_result}")
        
    except Exception as e:
        print(f"❌ Trade failed: {e}")

if __name__ == "__main__":
    test_cross_chain_trades()