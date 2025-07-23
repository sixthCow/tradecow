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
  OrderType,
  DCAFrequency,
  LimitCondition,
} from "./schemas";

import {
  getChainId,
  getTokenDecimals,
  getTokenBalance,
  getTokenAllowance,
  parseAmount,
  formatAmount,
  isValidAddress,
  isNativeToken,
  getCurrentTimestamp,
  calculateNextExecutionTime,
  shouldExecuteDCA,
  shouldExecuteLimitOrder,
  isOrderExpired,
  generateOrderId,
  getTokenPrice,
  getOneInchQuote,
  getOneInchSwap,
  extractDexName,
  calculatePriceImpact,
  validateOrderParameters,
  ERC20_ABI,
} from "./helpers";

import { laUtils } from "@lit-protocol/vincent-scaffold-sdk";
import { ethers } from "ethers";

export const vincentTool = createVincentTool({
  packageName: "@lit-protocol/vincent-tool-dca-limit-order" as const,
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
      console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Starting precheck");
      console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] params:", {
        toolParams,
      });

      const {
        orderType,
        fromTokenAddress,
        toTokenAddress,
        amount,
        chain,
        slippageBps,
        frequency,
        totalExecutions,
        nextExecutionTime,
        targetPrice,
        condition,
        expirationTime,
        rpcUrl,
        orderId,
      } = toolParams;

      // Basic validation
      if (!Object.values(OrderType).includes(orderType)) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Invalid order type. Must be DCA or LIMIT",
        });
      }

      if (!isValidAddress(fromTokenAddress)) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Invalid from token address format",
        });
      }

      if (!isValidAddress(toTokenAddress)) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Invalid to token address format",
        });
      }

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Invalid amount format or amount must be greater than 0",
        });
      }

      // Check if tokens are different
      if (fromTokenAddress.toLowerCase() === toTokenAddress.toLowerCase()) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] From and to tokens must be different",
        });
      }

      // Validate order-specific parameters
      const paramValidation = validateOrderParameters(orderType, {
        frequency,
        totalExecutions,
        nextExecutionTime,
        targetPrice,
        condition,
        expirationTime,
      });

      if (!paramValidation.valid) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dca-limit-order/precheck] ${paramValidation.error}`,
        });
      }

      // Enhanced validation - connect to blockchain
      console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Starting enhanced validation...");

      if (!rpcUrl) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] RPC URL is required for precheck",
        });
      }

      // Get provider
      let provider: ethers.providers.JsonRpcProvider;
      try {
        provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      } catch (error) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dca-limit-order/precheck] Unable to obtain blockchain provider: ${
            error instanceof Error ? error.message : error.toString()
          }`,
        });
      }

      // Get chain ID and validate
      const chainId = getChainId(chain);
      const network = await provider.getNetwork();
      
      if (network.chainId !== chainId) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dca-limit-order/precheck] RPC chain ID (${network.chainId}) does not match specified chain (${chainId})`,
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
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Failed to get token decimals - invalid token address",
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
          error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Failed to get user balance",
        });
      }

      if (userBalance.lt(fromAmountWei)) {
        return fail({
          error: `[@lit-protocol/vincent-tool-dca-limit-order/precheck] Insufficient balance. Have: ${formatAmount(
            userBalance.toString(),
            fromTokenDecimals
          )}, Need: ${amount}`,
        });
      }

      // Get DEX quote for price estimation
      let quote: any;
      let routerAddress: string = "";
      try {
        quote = await getOneInchQuote(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei,
          slippageBps
        );
        
        // Get swap data to extract router address
        const swapData = await getOneInchSwap(
          chainId,
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei,
          pkpAddress,
          slippageBps
        );
        routerAddress = swapData.tx.to;
      } catch (error) {
        console.warn("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Failed to get DEX quote:", error);
      }

      // Check token allowance if not native token
      let allowance: ethers.BigNumber = ethers.constants.MaxUint256;
      if (!isNativeToken(fromTokenAddress) && routerAddress) {
        try {
          allowance = await getTokenAllowance(
            provider,
            fromTokenAddress,
            pkpAddress,
            routerAddress
          );
        } catch (error) {
          console.warn("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Failed to get token allowance");
        }
      }

      // Order-specific logic
      let conditionMet = false;
      let currentPrice: string | undefined;
      let nextExecTime: number | undefined;
      let execRemaining: number | undefined;

      if (orderType === OrderType.DCA) {
        // Check if it's time to execute DCA
        conditionMet = shouldExecuteDCA(nextExecutionTime!);
        nextExecTime = nextExecutionTime;
        execRemaining = totalExecutions;
        
        console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] DCA order check:", {
          nextExecutionTime: nextExecutionTime,
          currentTime: getCurrentTimestamp(),
          conditionMet,
          execRemaining,
        });
      } else if (orderType === OrderType.LIMIT) {
        // Check if limit order conditions are met
        try {
          if (isOrderExpired(expirationTime!)) {
            return fail({
              error: "[@lit-protocol/vincent-tool-dca-limit-order/precheck] Order has expired",
            });
          }

          // Get current price (simplified - using 1inch quote as price proxy)
          if (quote) {
            const inputAmount = ethers.BigNumber.from(fromAmountWei);
            const outputAmount = ethers.BigNumber.from(quote.dstAmount);
            currentPrice = outputAmount.mul(ethers.constants.WeiPerEther).div(inputAmount).toString();
            currentPrice = formatAmount(currentPrice, 18); // Convert to readable format
          }
          
          conditionMet = currentPrice ? shouldExecuteLimitOrder(currentPrice, targetPrice!, condition!) : false;
          
          console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Limit order check:", {
            currentPrice,
            targetPrice: targetPrice,
            condition: condition,
            conditionMet,
          });
        } catch (error) {
          console.warn("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Failed to check limit order conditions:", error);
        }
      }

      // Prepare success result
      const successResult: any = {
        orderValid: true,
        conditionMet,
        userBalance: userBalance.toString(),
      };

      if (currentPrice) {
        successResult.currentPrice = currentPrice;
      }
      if (targetPrice) {
        successResult.targetPrice = targetPrice;
      }
      if (!isNativeToken(fromTokenAddress)) {
        successResult.tokenAllowance = allowance.toString();
      }
      if (nextExecTime) {
        successResult.nextExecutionTime = nextExecTime;
      }
      if (execRemaining) {
        successResult.executionsRemaining = execRemaining;
      }
      if (quote) {
        successResult.dexQuote = {
          estimatedOutput: quote.dstAmount,
          priceImpact: calculatePriceImpact(
            fromAmountWei,
            quote.dstAmount,
            fromTokenDecimals,
            toTokenDecimals
          ),
          dexName: extractDexName(quote.protocols),
          routerAddress,
        };
        successResult.estimatedGas = quote.gas;
      }

      console.log("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Enhanced validation successful:", successResult);

      return succeed(successResult);
    } catch (error) {
      console.error("[@lit-protocol/vincent-tool-dca-limit-order/precheck] Error:", error);
      return fail({
        error: `[@lit-protocol/vincent-tool-dca-limit-order/precheck] Validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  },

  execute: async ({ toolParams }, { succeed, fail, delegation }) => {
    try {
      const {
        orderType,
        fromTokenAddress,
        toTokenAddress,
        amount,
        chain,
        slippageBps,
        frequency,
        totalExecutions,
        nextExecutionTime,
        targetPrice,
        condition,
        expirationTime,
        orderId,
      } = toolParams;

      console.log("[@lit-protocol/vincent-tool-dca-limit-order/execute] Executing DCA/Limit Order", {
        orderType,
        fromTokenAddress,
        toTokenAddress,
        amount,
        chain,
        slippageBps,
      });

      if (toolParams.rpcUrl) {
        return fail({
          error: "[@lit-protocol/vincent-tool-dca-limit-order/execute] RPC URL is not permitted for execute. Use the `chain` parameter, and the Lit Nodes will provide the RPC URL for you with the Lit.Actions.getRpcUrl() function",
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
        console.error("[@lit-protocol/vincent-tool-dca-limit-order/execute] Provider error:", error);
        throw new Error("Unable to obtain blockchain provider for DCA/Limit Order operations");
      }

      // Get PKP info
      const pkpPublicKey = delegation.delegatorPkpInfo.publicKey;
      const pkpAddress = ethers.utils.computeAddress(pkpPublicKey);

      if (!pkpPublicKey) {
        throw new Error("PKP public key not available from delegation context");
      }

      console.log("[@lit-protocol/vincent-tool-dca-limit-order/execute] PKP Address:", pkpAddress);

      // Re-validate order conditions before execution
      if (orderType === OrderType.DCA) {
        if (!shouldExecuteDCA(nextExecutionTime!)) {
          return fail({
            error: "[@lit-protocol/vincent-tool-dca-limit-order/execute] DCA execution time not reached yet",
          });
        }
      } else if (orderType === OrderType.LIMIT) {
        if (isOrderExpired(expirationTime!)) {
          return fail({
            error: "[@lit-protocol/vincent-tool-dca-limit-order/execute] Limit order has expired",
          });
        }

        // Check price condition again (simplified check)
        try {
          const quote = await getOneInchQuote(
            chainId,
            fromTokenAddress,
            toTokenAddress,
            parseAmount(amount, await getTokenDecimals(provider, fromTokenAddress)),
            slippageBps
          );
          
          // Calculate current price from quote
          const inputAmount = ethers.BigNumber.from(parseAmount(amount, await getTokenDecimals(provider, fromTokenAddress)));
          const outputAmount = ethers.BigNumber.from(quote.dstAmount);
          const currentPrice = formatAmount(
            outputAmount.mul(ethers.constants.WeiPerEther).div(inputAmount).toString(),
            18
          );
          
          if (!shouldExecuteLimitOrder(currentPrice, targetPrice!, condition!)) {
            return fail({
              error: `[@lit-protocol/vincent-tool-dca-limit-order/execute] Limit order condition not met. Current price: ${currentPrice}, Target: ${targetPrice}`,
            });
          }
        } catch (error) {
          console.warn("[@lit-protocol/vincent-tool-dca-limit-order/execute] Could not verify price condition, proceeding with execution");
        }
      }

      // Execute the swap using DEX aggregator logic
      const fromTokenDecimals = await getTokenDecimals(provider, fromTokenAddress);
      const toTokenDecimals = await getTokenDecimals(provider, toTokenAddress);
      const fromAmountWei = parseAmount(amount, fromTokenDecimals);

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
      console.log("[@lit-protocol/vincent-tool-dca-limit-order/execute] Executing swap transaction...");

      let txHash: string;
      
      try {
        // Get the nonce
        const nonce = await laUtils.transaction.primitive.getNonce({
          address: pkpAddress,
          chain: chain
        });
        
        // Create transaction object
        const txObject = {
          to: swapData.tx.to,
          nonce,
          data: swapData.tx.data,
          value: swapData.tx.value || "0",
          gasLimit: Math.ceil((swapData.tx.gas || 300000) * 1.1), // Add 10% buffer
          chainId,
        };
        
        console.log("[@lit-protocol/vincent-tool-dca-limit-order/execute] Transaction object:", txObject);
        
        // Sign transaction
        const signedTx = await laUtils.transaction.primitive.signTx({
          sigName: "dcaLimitOrderSwap",
          pkpPublicKey,
          tx: txObject
        });
        
        // Send transaction
        txHash = await laUtils.transaction.primitive.sendTx(
          chain,
          signedTx
        );
      } catch (error) {
        console.error("[@lit-protocol/vincent-tool-dca-limit-order/execute] Transaction execution error:", error);
        throw new Error(`Failed to execute swap transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      // Calculate execution details
      const executedAmount = fromAmountWei;
      const receivedAmount = swapData.dstAmount;
      const executionPrice = formatAmount(
        ethers.BigNumber.from(receivedAmount)
          .mul(ethers.constants.WeiPerEther)
          .div(ethers.BigNumber.from(executedAmount))
          .toString(),
        18
      );

      // Generate order ID if not provided
      const finalOrderId = orderId || generateOrderId(orderType, pkpAddress);

      // Calculate next execution details for DCA
      let executionsRemaining: number | undefined;
      let nextExecTime: number | undefined;

      if (orderType === OrderType.DCA) {
        executionsRemaining = Math.max(0, totalExecutions! - 1);
        if (executionsRemaining > 0 && frequency) {
          nextExecTime = calculateNextExecutionTime(frequency, getCurrentTimestamp());
        }
      }

      const dexUsed = extractDexName(swapData.protocols);

      console.log("[@lit-protocol/vincent-tool-dca-limit-order/execute] Order execution successful", {
        txHash,
        orderType,
        executedAmount,
        receivedAmount,
        executionPrice,
        dexUsed,
        executionsRemaining,
        nextExecTime,
      });

      return succeed({
        txHash,
        orderType,
        fromTokenAddress,
        toTokenAddress,
        executedAmount,
        receivedAmount,
        executionPrice,
        timestamp: Date.now(),
        orderId: finalOrderId,
        executionsRemaining,
        nextExecutionTime: nextExecTime,
        dexUsed,
      });
    } catch (error) {
      console.error("[@lit-protocol/vincent-tool-dca-limit-order/execute] Order execution failed", error);

      return fail({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
});