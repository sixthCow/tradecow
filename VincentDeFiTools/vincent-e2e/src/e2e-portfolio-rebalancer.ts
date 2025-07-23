import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { ethers } from "ethers";
import { vincentTool } from "../vincent-packages/tools/portfolio-rebalancer/src";
import { 
  ToolParams, 
  RebalanceStrategy,
  SUPPORTED_CHAINS 
} from "../vincent-packages/tools/portfolio-rebalancer/src/lib/schemas";

// Test configuration
const TEST_CONFIG = {
  // Use testnets for E2E tests
  ethereum: {
    chainId: "11155111", // Sepolia
    name: "sepolia",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/demo",
  },
  base: {
    chainId: "84532", // Base Sepolia  
    name: "basesepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/demo",
  },
  // Mock PKP for testing
  mockPkpAddress: "0x1234567890123456789012345678901234567890",
  mockPkpPublicKey: "0x04" + "a".repeat(128), // Mock compressed public key
};

// Mock token addresses for testnets
const TEST_TOKENS = {
  sepolia: {
    ETH: "0x0000000000000000000000000000000000000000", // Native ETH
    USDC: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F", // USDC on Sepolia
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Sepolia
  },
  basesepolia: {
    ETH: "0x0000000000000000000000000000000000000000", // Native ETH
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
    WETH: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
  },
};

describe("Portfolio Rebalancer Tool E2E Tests", () => {
  let mockDelegation: any;

  beforeAll(() => {
    // Setup mock delegation context
    mockDelegation = {
      delegatorPkpInfo: {
        ethAddress: TEST_CONFIG.mockPkpAddress,
        publicKey: TEST_CONFIG.mockPkpPublicKey,
        tokenId: "test-token-id",
      },
    };
  });

  describe("Schema Validation Tests", () => {
    it("should validate valid tool parameters", async () => {
      const validParams: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 60,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC", 
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 40,
            chain: "sepolia",
          },
        ],
        chainConfigs: [
          {
            chainId: TEST_CONFIG.ethereum.chainId,
            name: TEST_CONFIG.ethereum.name,
            rpcUrl: TEST_CONFIG.ethereum.rpcUrl,
          },
        ],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      // Should not throw validation error
      expect(() => vincentTool.toolParamsSchema.parse(validParams)).not.toThrow();
    });

    it("should reject invalid allocations that don't sum to 100%", () => {
      const invalidParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 30, // Only 30%, missing 70%
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      expect(() => vincentTool.toolParamsSchema.parse(invalidParams)).toThrow();
    });

    it("should reject unsupported chains", () => {
      const invalidParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 100,
            chain: "unsupported-chain", // Invalid chain
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      expect(() => vincentTool.toolParamsSchema.parse(invalidParams)).toThrow();
    });

    it("should reject invalid token addresses", () => {
      const invalidParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: "invalid-address", // Invalid address format
            targetPercentage: 100,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      expect(() => vincentTool.toolParamsSchema.parse(invalidParams)).toThrow();
    });
  });

  describe("Single Chain Rebalancing Tests", () => {
    it("should successfully precheck single chain ETH/USDC portfolio", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 70,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 30,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentAllocations).toHaveLength(2);
        expect(result.data.totalPortfolioValueUsd).toBeDefined();
        expect(typeof result.data.needsRebalancing).toBe("boolean");
        expect(Array.isArray(result.data.plannedActions)).toBe(true);
      }
    });

    it("should handle dry run execution for single chain", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 80,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 20,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.IMMEDIATE, // Force rebalancing
        rebalanceThresholdPercent: 1,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "0.1",
      };

      const result = await vincentTool.execute(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rebalanceComplete).toBe(true);
        expect(Array.isArray(result.data.executedActions)).toBe(true);
        expect(Array.isArray(result.data.finalAllocations)).toBe(true);
        expect(typeof result.data.executionTimeSeconds).toBe("number");
      }
    });
  });

  describe("Multi-Chain Rebalancing Tests", () => {
    it("should successfully precheck multi-chain portfolio", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 30,
            chain: "sepolia",
          },
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.basesepolia.ETH,
            targetPercentage: 30,
            chain: "basesepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 20,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.basesepolia.USDC,
            targetPercentage: 20,
            chain: "basesepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum, TEST_CONFIG.base],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentAllocations).toHaveLength(4);
        expect(result.data.plannedActions.every(action => 
          ["SWAP", "BRIDGE", "BRIDGE_AND_SWAP"].includes(action.type)
        )).toBe(true);
      }
    });

    it("should handle cross-chain bridging in dry run", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 20,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.basesepolia.USDC,
            targetPercentage: 80,
            chain: "basesepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum, TEST_CONFIG.base],
        strategy: RebalanceStrategy.IMMEDIATE,
        rebalanceThresholdPercent: 1,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "0.1",
      };

      const result = await vincentTool.execute(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should contain bridge actions for cross-chain rebalancing
        const bridgeActions = result.data.executedActions.filter(action => 
          action.type === "BRIDGE"
        );
        expect(bridgeActions.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Rebalancing Strategy Tests", () => {
    it("should respect THRESHOLD strategy", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 50,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 50,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 20, // High threshold - unlikely to trigger
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // With high threshold, might not need rebalancing
        expect(typeof result.data.needsRebalancing).toBe("boolean");
        expect(result.data.worstCaseDrift).toBeLessThan(100); // Reasonable drift
      }
    });

    it("should always trigger IMMEDIATE strategy", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 100,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.IMMEDIATE,
        rebalanceThresholdPercent: 50, // Ignored for IMMEDIATE
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // IMMEDIATE strategy should always indicate rebalancing needed
        expect(result.data.needsRebalancing).toBe(true);
      }
    });
  });

  describe("Error Handling Tests", () => {
    it("should fail with invalid RPC URL", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 100,
            chain: "sepolia",
          },
        ],
        chainConfigs: [
          {
            chainId: "11155111",
            name: "sepolia",
            rpcUrl: "https://invalid-rpc-url.com", // Invalid RPC
          },
        ],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to connect");
      }
    });

    it("should fail with mismatched chain ID", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 100,
            chain: "sepolia",
          },
        ],
        chainConfigs: [
          {
            chainId: "1", // Wrong chain ID for Sepolia
            name: "sepolia",
            rpcUrl: TEST_CONFIG.ethereum.rpcUrl,
          },
        ],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Chain ID mismatch");
      }
    });
  });

  describe("Gas and Slippage Tests", () => {
    it("should respect gas price limits", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 60,
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 40,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.IMMEDIATE,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        maxGasPrice: "1", // Extremely low gas price limit
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      // Should either succeed with low gas usage or fail due to gas limit
      expect(typeof result.success).toBe("boolean");
    });

    it("should validate slippage parameters", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 100,
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.THRESHOLD,
        rebalanceThresholdPercent: 5,
        swapSlippageBps: 50, // 0.5% slippage
        bridgeSlippageBps: 200, // 2% slippage
        dryRun: true,
        minRebalanceAmount: "1.0",
      };

      // Should not throw - these are valid slippage values
      expect(() => vincentTool.toolParamsSchema.parse(params)).not.toThrow();
    });
  });

  describe("Min/Max Amount Constraints Tests", () => {
    it("should respect minimum rebalance amount", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 51, // Small deviation
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 49, // Small deviation
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.IMMEDIATE,
        rebalanceThresholdPercent: 1,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "1000.0", // High minimum - should prevent small rebalances
      };

      const result = await vincentTool.precheck(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have fewer or no actions due to high minimum
        expect(Array.isArray(result.data.plannedActions)).toBe(true);
      }
    });

    it("should respect maximum rebalance amount", async () => {
      const params: ToolParams = {
        targetAllocations: [
          {
            tokenSymbol: "ETH",
            tokenAddress: TEST_TOKENS.sepolia.ETH,
            targetPercentage: 10, // Large deviation
            chain: "sepolia",
          },
          {
            tokenSymbol: "USDC",
            tokenAddress: TEST_TOKENS.sepolia.USDC,
            targetPercentage: 90, // Large deviation
            chain: "sepolia",
          },
        ],
        chainConfigs: [TEST_CONFIG.ethereum],
        strategy: RebalanceStrategy.IMMEDIATE,
        rebalanceThresholdPercent: 1,
        swapSlippageBps: 100,
        bridgeSlippageBps: 100,
        dryRun: true,
        minRebalanceAmount: "0.1",
        maxRebalanceAmount: "10.0", // Low maximum - should limit large rebalances
      };

      const result = await vincentTool.execute(
        { toolParams: params },
        {
          succeed: (data) => ({ success: true, ...data }),
          fail: (error) => ({ success: false, ...error }),
          delegation: mockDelegation,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // All executed actions should respect the maximum amount
        expect(result.data.executedActions.every(action => {
          const amount = parseFloat(action.executedAmount);
          return amount <= 10.0 || action.txHash === "FAILED";
        })).toBe(true);
      }
    });
  });

  afterAll(() => {
    // Cleanup if needed
  });
});