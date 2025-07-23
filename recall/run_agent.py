#!/usr/bin/env python3
"""
Bitcoin Maximalist Trading Agent CLI
===================================

Simple command-line interface for the Bitcoin Maximalist Trading Agent.
"""

import argparse
import sys
import os
from dotenv import load_dotenv

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from btc_agent import BitcoinMaximalistAgent, logger
from config import Config

def load_environment():
    """Load environment variables from .env file"""
    load_dotenv()
    
    api_key = os.getenv("RECALL_API_KEY")
    if not api_key:
        logger.error("❌ RECALL_API_KEY not found in environment variables")
        logger.info("💡 Copy .env.example to .env and set your API key")
        sys.exit(1)
    
    return api_key

def run_strategy(args):
    """Run the full Bitcoin maximalist strategy"""
    api_key = load_environment()
    agent = BitcoinMaximalistAgent(api_key)
    
    logger.info("🚀 Running Bitcoin Maximalist Strategy...")
    
    try:
        result = agent.run_strategy()
        
        if args.save:
            import json
            from datetime import datetime
            filename = f"btc_agent_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(filename, "w") as f:
                json.dump(result, f, indent=2)
            logger.info(f"📝 Results saved to {filename}")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Strategy failed: {e}")
        sys.exit(1)

def show_status(args):
    """Show current portfolio status"""
    api_key = load_environment()
    agent = BitcoinMaximalistAgent(api_key)
    
    logger.info("📊 Getting current portfolio status...")
    
    try:
        status = agent.get_status()
        
        if "error" in status:
            logger.error(f"❌ Failed to get status: {status['error']}")
            sys.exit(1)
        
        print("\n" + "="*60)
        print("📊 BITCOIN MAXIMALIST AGENT STATUS")
        print("="*60)
        print(f"💰 Total Portfolio Value: ${status['total_portfolio_value']:.2f}")
        print(f"₿  Total WBTC Amount: {status['wbtc_amount']:.8f} WBTC")
        print(f"💵 Total WBTC Value: ${status['wbtc_value']:.2f}")
        print(f"📈 WBTC Percentage: {status['wbtc_percentage']:.1f}%")
        
        print(f"\n🌐 CHAIN DISTRIBUTION:")
        print("-" * 40)
        for chain, percentage in status['chain_distribution'].items():
            target = status['target_distribution'].get(chain, 0)
            drift = abs(percentage - target)
            status_emoji = "✅" if drift <= Config.REBALANCE_THRESHOLD else "⚠️"
            print(f"{status_emoji} {chain.capitalize()}: {percentage*100:.1f}% "
                  f"(target: {target*100:.1f}%)")
        
        print(f"\n🕐 Last Updated: {status['timestamp']}")
        print("="*60)
        
    except Exception as e:
        logger.error(f"❌ Failed to get status: {e}")
        sys.exit(1)

def show_portfolio(args):
    """Show detailed portfolio breakdown"""
    api_key = load_environment()
    agent = BitcoinMaximalistAgent(api_key)
    
    try:
        portfolio = agent.api.get_enhanced_portfolio()
        
        print("\n" + "="*80)
        print("📊 DETAILED PORTFOLIO BREAKDOWN")
        print("="*80)
        print(f"💰 Total Value: ${portfolio.get('totalValue', 0):.2f}")
        
        if portfolio.get('tokens'):
            print(f"\n🪙 TOKENS ({len(portfolio['tokens'])} positions):")
            print("-" * 80)
            print(f"{'TOKEN':<8} | {'AMOUNT':>14} | {'VALUE':>10} | {'CHAIN':<12} | {'NETWORK'}")
            print("-" * 80)
            
            for token in portfolio['tokens']:
                # Use API-provided information when available
                symbol = token.get("symbol", "UNKNOWN")
                specific_chain = token.get("specificChain", "unknown")
                chain_type = token.get("chain_type", token.get("chain", "evm"))
                
                # Format chain display name
                if specific_chain == "svm":
                    chain_display = "Solana"
                    network_type = "SVM"
                elif specific_chain in ["eth", "ethereum"]:
                    chain_display = "Ethereum"
                    network_type = "EVM"
                elif specific_chain == "arbitrum":
                    chain_display = "Arbitrum"
                    network_type = "EVM"
                elif specific_chain == "optimism":
                    chain_display = "Optimism"
                    network_type = "EVM"
                elif specific_chain == "base":
                    chain_display = "Base"
                    network_type = "EVM"
                elif specific_chain == "polygon":
                    chain_display = "Polygon"
                    network_type = "EVM"
                else:
                    chain_display = specific_chain.capitalize()
                    network_type = chain_type.upper()
                
                # Add emoji for Bitcoin-related tokens
                if symbol == "WBTC":
                    display_symbol = "₿ WBTC"
                elif symbol == "BTC":
                    display_symbol = "₿ BTC"
                else:
                    display_symbol = symbol
                
                print(f"{display_symbol:<8} | {token['amount']:>14.6f} | ${token['value']:>8.2f} | "
                      f"{chain_display:<12} | {network_type}")
        
        print("="*80)
        
        # Show WBTC summary
        wbtc_tokens = [
            token for token in portfolio.get('tokens', [])
            if token.get('symbol') == 'WBTC' or agent.detector.is_wbtc_address(token['token'])
        ]
        
        if wbtc_tokens:
            total_wbtc_amount = sum(token['amount'] for token in wbtc_tokens)
            total_wbtc_value = sum(token['value'] for token in wbtc_tokens)
            wbtc_percentage = (total_wbtc_value / portfolio.get('totalValue', 1)) * 100
            
            print(f"\n₿ BITCOIN SUMMARY:")
            print("-" * 40)
            print(f"Total WBTC Amount: {total_wbtc_amount:.8f} WBTC")
            print(f"Total WBTC Value:  ${total_wbtc_value:.2f}")
            print(f"BTC Allocation:    {wbtc_percentage:.1f}%")
            
            if len(wbtc_tokens) > 1:
                print(f"\n🌐 Distribution across {len(wbtc_tokens)} chains:")
                for token in wbtc_tokens:
                    specific_chain = token.get('specificChain', 'unknown')
                    chain_pct = (token['value'] / total_wbtc_value) * 100
                    chain_display = agent.detector.format_chain_display_name(specific_chain)
                    print(f"  {chain_display}: "
                          f"{token['amount']:.6f} WBTC ({chain_pct:.1f}%)")
        
    except Exception as e:
        logger.error(f"❌ Failed to get portfolio: {e}")
        sys.exit(1)

def main():
    """Main CLI function"""
    parser = argparse.ArgumentParser(
        description="Bitcoin Maximalist Trading Agent for Recall Network",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_agent.py run --save     # Run strategy and save results
  python run_agent.py status         # Show current status  
  python run_agent.py portfolio      # Show detailed portfolio
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Run strategy command
    run_parser = subparsers.add_parser('run', help='Execute the Bitcoin maximalist strategy')
    run_parser.add_argument('--save', action='store_true', 
                           help='Save results to JSON file')
    run_parser.set_defaults(func=run_strategy)
    
    # Status command
    status_parser = subparsers.add_parser('status', help='Show current portfolio status')
    status_parser.set_defaults(func=show_status)
    
    # Portfolio command  
    portfolio_parser = subparsers.add_parser('portfolio', help='Show detailed portfolio breakdown')
    portfolio_parser.set_defaults(func=show_portfolio)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Execute the selected command
    args.func(args)

if __name__ == "__main__":
    main()