"""
Multi-chain token detection and mapping system
"""

from typing import Dict, Optional, Tuple

class MultiChainTokenDetector:
    """Detects and maps tokens across different blockchain networks"""
    
    # Comprehensive token mapping across all supported chains
    TOKEN_ADDRESSES = {
        # USDC across chains
        "USDC": {
            "ethereum": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            "arbitrum": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",  # Updated address
            "optimism": "0x7f5c764cbc14f9669b88837ca1490cca17c31607",  # Updated address
            "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "polygon": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            "solana": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        },
        
        # USDbC (Base's native USDC)
        "USDbC": {
            "base": "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
        },
        
        # WETH across chains
        "WETH": {
            "ethereum": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "arbitrum": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
            "optimism": "0x4200000000000000000000000000000000000006",
            "base": "0x4200000000000000000000000000000000000006",
            "polygon": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
            # Solana wrapped ETH
            "solana": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"
        },
        
        # WBTC across chains (updated with actual addresses from API)
        "WBTC": {
            "ethereum": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
            "arbitrum": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
            "optimism": "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
            "base": "0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b",
            "polygon": "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",  # From API response
            # Solana wrapped BTC
            "solana": "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"
        },
        
        # Native tokens
        "ETH": {
            "ethereum": "0x0000000000000000000000000000000000000000",  # Native ETH
            "arbitrum": "0x0000000000000000000000000000000000000000",   # Native ETH on Arbitrum
            "optimism": "0x0000000000000000000000000000000000000000",   # Native ETH on Optimism
            "base": "0x0000000000000000000000000000000000000000",       # Native ETH on Base
        },
        
        "BTC": {
            # Native BTC doesn't exist on these chains, but we can map to wrapped versions
            "solana": "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E"  # Native BTC on Solana
        },
        
        "SOL": {
            "solana": "So11111111111111111111111111111111111111112",  # From API response
            # Wrapped SOL on other chains
            "ethereum": "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
            "arbitrum": "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07"
        },
        
        # Popular DeFi tokens
        "USDT": {
            "ethereum": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            "arbitrum": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            "optimism": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
            "base": "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
            "polygon": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
            "solana": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
        },
        
        "DAI": {
            "ethereum": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            "arbitrum": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
            "optimism": "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
            "base": "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
            "polygon": "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063"
        }
    }
    
    # Chain detection mapping
    CHAIN_DETECTION = {
        # EVM chains
        "evm": {
            "ethereum": ["eth", "mainnet", "1"],
            "arbitrum": ["arbitrum", "arb", "42161"],
            "optimism": ["optimism", "op", "10"],
            "base": ["base", "8453"],
            "polygon": ["polygon", "matic", "137"]
        },
        # Solana
        "svm": {
            "solana": ["solana", "sol", "mainnet-beta"]
        }
    }
    
    @classmethod
    def detect_token_and_chain(cls, token_address: str, chain_hint: str = None) -> Tuple[str, str]:
        """
        Detect token symbol and specific chain from address
        Returns: (token_symbol, specific_chain)
        """
        # Handle native token cases
        if token_address == "0x0000000000000000000000000000000000000000":
            if chain_hint and "evm" in chain_hint.lower():
                return "ETH", "ethereum"  # Default to ethereum for native ETH
        
        # Search through all tokens and chains
        for token_symbol, chain_addresses in cls.TOKEN_ADDRESSES.items():
            for chain, address in chain_addresses.items():
                if address.lower() == token_address.lower():
                    return token_symbol, chain
        
        return "UNKNOWN", cls._detect_specific_chain(chain_hint) if chain_hint else "unknown"
    
    @classmethod
    def _detect_specific_chain(cls, chain_hint: str) -> str:
        """Detect specific chain from chain hint"""
        if not chain_hint:
            return "unknown"
            
        chain_hint = chain_hint.lower()
        
        # Check EVM chains
        if "evm" in chain_hint:
            # For now, default to ethereum if no other info
            return "ethereum"
        
        # Check Solana
        if "svm" in chain_hint or "solana" in chain_hint:
            return "solana"
        
        return "unknown"
    
    @classmethod
    def get_wbtc_addresses(cls) -> Dict[str, str]:
        """Get all WBTC addresses across chains"""
        return cls.TOKEN_ADDRESSES.get("WBTC", {})
    
    @classmethod
    def get_token_addresses(cls, symbol: str) -> Dict[str, str]:
        """Get all addresses for a specific token symbol"""
        return cls.TOKEN_ADDRESSES.get(symbol.upper(), {})
    
    @classmethod
    def is_wbtc_address(cls, token_address: str) -> bool:
        """Check if an address is WBTC on any chain"""
        wbtc_addresses = cls.get_wbtc_addresses()
        return any(addr.lower() == token_address.lower() for addr in wbtc_addresses.values())
    
    @classmethod 
    def get_supported_chains(cls) -> list:
        """Get list of all supported chains"""
        chains = set()
        for token_data in cls.TOKEN_ADDRESSES.values():
            chains.update(token_data.keys())
        return sorted(list(chains))
    
    @classmethod
    def format_chain_display_name(cls, chain: str) -> str:
        """Format chain name for display"""
        chain_names = {
            "ethereum": "Ethereum",
            "arbitrum": "Arbitrum",
            "optimism": "Optimism", 
            "base": "Base",
            "polygon": "Polygon",
            "solana": "Solana"
        }
        return chain_names.get(chain.lower(), chain.capitalize())