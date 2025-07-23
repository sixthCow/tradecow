import {
  createVincentTool,
  supportedPoliciesForTool,
} from "@lit-protocol/vincent-tool-sdk";
import "@lit-protocol/vincent-tool-sdk/internal";

import {
  executeFailSchema,
  executeSuccessSchema,
  precheckFailSchema,
  precheckSuccessSchema,
  toolParamsSchema,
} from "./schemas";

import {
  getChainId,
  getTokenDecimals,
  getTokenBalance,
  getTokenAllowance,
  getOneInchQuote,
  getOneInchSwap,
  extractDexName,
  extractRoute,
  calculatePriceImpact,
  parseAmount,
  formatAmount,
  isValidAddress,
  isNativeToken,
  ERC20_ABI,
} from "./helpers";

import { laUtils } from "@lit-protocol/vincent-scaffold-sdk";
import { ethers } from "ethers";

export const vincentTool = createVincentTool({
  packageName: "@lit-protocol/vincent-tool-dex-aggregator" as const,
  toolParamsSchema,
  supportedPolicies: supportedPoliciesForTool([]),

  precheckSuccessSchema,
  precheckFailSchema,

  executeSuccessSchema,
  executeFailSchema,

  precheck: async (
    { toolParams },
    { succeed, fail, delegation: { delegatorPkpInfo } }
  ) => {
    try {
      console.log("[@lit-protocol/vincent-tool-dex-aggregator/precheck]");
      console.log("[@lit-protocol/vincent-tool-dex-aggregator/precheck] params:", {
        toolParams,
      });

      const { fromTokenAddress, toTokenAddress, amount, chain, slippageBps, rpcUrl } = toolParams;

      // Validate addresses
      if (!isValidAddress(fromTokenAddress)) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Invalid from token address format",
        });
      }

      if (!isValidAddress(toTokenAddress)) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Invalid to token address format",
        });
      }

      // Validate amount
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Invalid amount format or amount must be greater than 0",
        });
      }

      // Check if tokens are different
      if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] From and to tokens must be different",
        });
      }

      // Enhanced validation - connect to blockchain and validate everything
      console.log("[@lit-protocol/vincent-tool-dex-aggregator/precheck] Starting enhanced validation...");

      if (!rpcUrl) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] RPC URL is required for precheck",
        });
      }

      // Get provider
      let provider: ethers.providers.JsonRpcProvider;
      try {
        provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      } catch (error) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Unable to obtain blockchain provider: ${
            error instanceof Error ? error.message : error.toString()
          }`,
        });
      }

      // Get chain ID and validate
      const chainId = getChainId(chain);
      const network = await provider.getNetwork();
      
      if (network.chainId !== chainId) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] RPC chain ID (${network.chainId}) does not match specified chain (${chainId})`,
        });
      }

      // Get PKP address
      const pkpAddress = delegatorPkpInfo.ethAddress;

      // Get token decimals
      let fromTokenDecimals: number;
      let toTokenDecimals: number;
      try {
        fromTokenDecimals = await getTokenDecimals(provider, fromTokenAddress);
        toTokenDecimals = await getTokenDecimals(provider, toTokenAddress);
      } catch (error) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Failed to get token decimals - invalid token address",
        });
      }

      // Convert amount to wei/smallest unit
      const fromAmountWei = parseAmount(amount, fromTokenDecimals);

      // Check user balance
      let userBalance: ethers.BigNumber;
      try {
        userBalance = await getTokenBalance(provider, fromTokenAddress, pkpAddress);
      } catch (error) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Failed to get user balance",
        });
      }

      if (userBalance.lt(fromAmountWei)) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Insufficient balance. Have: ${formatAmount(
            userBalance.toString(),
            fromTokenDecimals
          )}, Need: ${amount}`,
        });
      }

      // Get quote from 1inch
      let quote: any;
      try {
        quote = await getOneInchQuote(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei,
          slippageBps
        );
      } catch (error) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Failed to get quote: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }

      // Get swap transaction data to extract router address and call data
      let swapData: any;
      try {
        swapData = await getOneInchSwap(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei,
          pkpAddress,
          slippageBps
        );
      } catch (error) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Failed to get swap data: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }

      const routerAddress = swapData.tx.to;

      // Check token allowance if not native token
      let allowance: ethers.BigNumber = ethers.constants.MaxUint256;
      if (!isNativeToken(fromTokenAddress)) {
        try {
          allowance = await getTokenAllowance(
            provider,
            fromTokenAddress,
            pkpAddress,
            routerAddress
          );
        } catch (error) {
          return fail({
            error: "[@lit-protocol/vincent-tool-dex-aggregator/precheck] Failed to get token allowance",
          });
        }

        if (allowance.lt(fromAmountWei)) {
          return fail({
            error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Insufficient token allowance. Current allowance: ${formatAmount(
              allowance.toString(),
              fromTokenDecimals
            )}, Required: ${amount}. Please approve the token first using the ERC20 approval tool.`,
          });
        }
      }

      // Extract additional information
      const dexName = extractDexName(quote.protocols);
      const route = extractRoute(quote.protocols);
      const priceImpact = calculatePriceImpact(
        fromAmountWei,
        quote.dstAmount,
        fromTokenDecimals,
        toTokenDecimals
      );

      const successResult = {
        fromTokenAddress,
        toTokenAddress,
        fromAmount: fromAmountWei,
        estimatedToAmount: quote.dstAmount,
        routerAddress,
        callData: swapData.tx.data,
        estimatedGas: quote.gas || swapData.tx.gas,
        priceImpact,
        dexName,
        route,
        userBalance: userBalance.toString(),
        allowance: allowance.toString(),
      };

      console.log("[@lit-protocol/vincent-tool-dex-aggregator/precheck] Enhanced validation successful:", successResult);

      return succeed(successResult);
    } catch (error) {
      console.error("[@lit-protocol/vincent-tool-dex-aggregator/precheck] Error:", error);
      return fail({
        error: `[@lit-protocol/vincent-tool-dex-aggregator/precheck] Validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  },

  execute: async ({ toolParams }, { succeed, fail, delegation }) => {
    try {
      const { fromTokenAddress, toTokenAddress, amount, chain, slippageBps } = toolParams;

      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] Executing DEX aggregator swap", {
        fromTokenAddress,
        toTokenAddress,
        amount,
        chain,
        slippageBps,
      });

      if (toolParams.rpcUrl) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dex-aggregator/execute] RPC URL is not permitted for execute. Use the `chain` parameter, and the Lit Nodes will provide the RPC URL for you with the Lit.Actions.getRpcUrl() function",
        });
      }

      // Get chain ID
      const chainId = getChainId(chain);

      // Get provider
      let provider: ethers.providers.JsonRpcProvider;
      try {
        provider = new ethers.providers.JsonRpcProvider(
          await Lit.Actions.getRpcUrl({ chain })
        );
      } catch (error) {
        console.error("[@lit-protocol/vincent-tool-dex-aggregator/execute] Provider error:", error);
        throw new Error("Unable to obtain blockchain provider for DEX aggregator operations");
      }

      // Get PKP info
      const pkpPublicKey = delegation.delegatorPkpInfo.publicKey;
      const pkpAddress = ethers.utils.computeAddress(pkpPublicKey);

      if (!pkpPublicKey) {
        throw new Error("PKP public key not available from delegation context");
      }

      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] PKP Address:", pkpAddress);

      // Get token decimals
      const fromTokenDecimals = await getTokenDecimals(provider, fromTokenAddress);
      const toTokenDecimals = await getTokenDecimals(provider, toTokenAddress);

      // Convert amount to wei/smallest unit
      const fromAmountWei = parseAmount(amount, fromTokenDecimals);

      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] From token decimals:", fromTokenDecimals);
      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] Converted amount:", fromAmountWei);

      // Get swap transaction data from 1inch
      let swapData: any;
      try {
        swapData = await getOneInchSwap(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei,
          pkpAddress,
          slippageBps
        );
      } catch (error) {
        throw new Error(`Failed to get swap data: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Check token allowance if not native token
      if (!isNativeToken(fromTokenAddress)) {
        const allowance = await getTokenAllowance(
          provider,
          fromTokenAddress,
          pkpAddress,
          swapData.tx.to
        );

        if (allowance.lt(fromAmountWei)) {
          throw new Error(
            `Insufficient token allowance. Current allowance: ${formatAmount(
              allowance.toString(),
              fromTokenDecimals
            )}, Required: ${amount}. Please approve the token first using the ERC20 approval tool.`
          );
        }
      }

      // Execute the swap transaction
      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] Executing swap transaction...");

      let txHash: string;
      
      // For DEX aggregator swaps, we need to use the low-level primitive methods
      // to properly handle the raw transaction data from 1inch
      try {
        // Get the nonce
        const nonce = await laUtils.transaction.primitive.getNonce({
          address: pkpAddress,
          chain: chain // Use chain name instead of provider
        });
        
        // Create transaction object with all required fields
        const txObject = {
          to: swapData.tx.to,
          nonce,
          data: swapData.tx.data,
          value: swapData.tx.value || "0",
          gasLimit: Math.ceil((swapData.tx.gas || 300000) * 1.1), // Add 10% buffer to gas estimate
          chainId,
        };
        
        console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] Transaction object:", txObject);
        
        // Sign transaction - use correct parameter names
        const signedTx = await laUtils.transaction.primitive.signTx({
          sigName: "dexAggregatorSwap",
          pkpPublicKey,
          tx: txObject
        });
        
        // Send transaction - properly pass the parameters
        txHash = await laUtils.transaction.primitive.sendTx(
          chain, // First parameter is the chain
          signedTx  // Second parameter is the signed transaction
        );
      } catch (error) {
        console.error("[@lit-protocol/vincent-tool-dex-aggregator/execute] Transaction execution error:", error);
        throw new Error(`Failed to execute swap transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Extract DEX name for response
      const dexName = extractDexName(swapData.protocols);

      console.log("[@lit-protocol/vincent-tool-dex-aggregator/execute] DEX aggregator swap successful", {
        txHash,
        fromTokenAddress,
        toTokenAddress,
        amount,
        dexName,
      });

      return succeed({
        txHash,
        fromTokenAddress,
        toTokenAddress,
        fromAmount: fromAmountWei,
        estimatedToAmount: swapData.dstAmount,
        dexName,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[@lit-protocol/vincent-tool-dex-aggregator/execute] DEX aggregator swap failed", error);

      return fail({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
});