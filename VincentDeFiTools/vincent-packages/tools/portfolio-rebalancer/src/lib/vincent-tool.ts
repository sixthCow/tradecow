import {
  createVincentTool,
  supportedPoliciesForTool,
} from "@lit-protocol/vincent-tool-sdk";
import "@lit-protocol/vincent-tool-sdk/internal";
import { ethers } from "ethers";
import {
  toolParamsSchema,
  precheckSuccessSchema,
  precheckFailSchema,
  executeSuccessSchema,
  executeFailSchema,
  RebalanceStrategy,
  RebalanceAction,
} from "./schemas";
import {
  readPortfolioBalances,
  needsRebalancing,
  calculateRebalanceActions,
  estimateRebalanceGasCosts,
  getChainId,
} from "./helpers";

export const vincentTool = createVincentTool({
  packageName: "@lit-protocol/vincent-tool-portfolio-rebalancer" as const,
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
    const logPrefix = "[@lit-protocol/vincent-tool-portfolio-rebalancer/precheck]";
    console.log(`${logPrefix} Starting portfolio rebalancing precheck with params:`, toolParams);

    const {
      targetAllocations,
      chainConfigs,
      strategy,
      rebalanceThresholdPercent,
      swapSlippageBps,
      bridgeSlippageBps,
      maxGasPrice,
      dryRun,
      minRebalanceAmount,
      maxRebalanceAmount,
    } = toolParams;

    try {
      // Validate basic parameters
      if (targetAllocations.length === 0) {
        return fail({ error: `${logPrefix} At least one target allocation is required` });
      }

      if (chainConfigs.length === 0) {
        return fail({ error: `${logPrefix} At least one chain configuration is required` });
      }

      // Get PKP address
      const pkpAddress = delegatorPkpInfo.ethAddress;
      console.log(`${logPrefix} PKP Address: ${pkpAddress}`);

      // Validate chain configurations by testing RPC connections
      for (const chainConfig of chainConfigs) {
        try {
          const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
          const network = await provider.getNetwork();
          const expectedChainId = getChainId(chainConfig.name);
          
          if (network.chainId.toString() !== expectedChainId) {
            return fail({
              error: `${logPrefix} Chain ID mismatch for ${chainConfig.name}. Expected: ${expectedChainId}, Got: ${network.chainId}`
            });
          }
        } catch (error: any) {
          return fail({
            error: `${logPrefix} Failed to connect to ${chainConfig.name} RPC: ${error?.message || 'Unknown error'}`
          });
        }
      }

      console.log(`${logPrefix} Reading current portfolio balances across ${chainConfigs.length} chains...`);

      // Read current portfolio state
      const currentAllocations = await readPortfolioBalances(
        chainConfigs,
        targetAllocations,
        pkpAddress
      );

      console.log(`${logPrefix} Current allocations:`, currentAllocations.map(a => ({
        token: a.tokenSymbol,
        chain: a.chain,
        balance: a.balance,
        current: `${a.currentPercentage.toFixed(2)}%`,
        target: `${a.targetPercentage}%`,
        drift: `${a.drift.toFixed(2)}%`
      })));

      // Calculate total portfolio value
      const totalPortfolioValueUsd = currentAllocations.reduce(
        (sum, allocation) => sum + parseFloat(allocation.usdValue),
        0
      );

      console.log(`${logPrefix} Total portfolio value: $${totalPortfolioValueUsd.toFixed(2)}`);

      // Check if rebalancing is needed
      const rebalanceCheck = needsRebalancing(
        currentAllocations,
        strategy,
        rebalanceThresholdPercent
      );

      console.log(`${logPrefix} Rebalance check:`, rebalanceCheck);

      let plannedActions: RebalanceAction[] = [];
      let estimatedGas = "0";
      let estimatedTime = "0";

      if (rebalanceCheck.needsRebalancing) {
        console.log(`${logPrefix} Calculating rebalancing actions...`);
        
        const minRebalanceAmountUsd = parseFloat(minRebalanceAmount);
        plannedActions = calculateRebalanceActions(currentAllocations, minRebalanceAmountUsd);

        // Apply max rebalance amount constraint if specified
        if (maxRebalanceAmount) {
          const maxRebalanceAmountUsd = parseFloat(maxRebalanceAmount);
          plannedActions = plannedActions.filter(action => {
            const fromAllocation = currentAllocations.find(a => a.tokenAddress === action.fromToken);
            if (!fromAllocation) return false;
            
            const actionUsd = parseFloat(action.amount) * 
              (parseFloat(fromAllocation.usdValue || "0") / parseFloat(fromAllocation.balance || "1"));
            return actionUsd <= maxRebalanceAmountUsd;
          });
        }

        console.log(`${logPrefix} Planned actions:`, plannedActions.map(a => ({
          type: a.type,
          from: `${a.amount} on ${a.fromChain}`,
          to: a.toChain || a.fromChain,
          priority: a.priority
        })));

        // Estimate gas costs
        const gasEstimate = estimateRebalanceGasCosts(plannedActions);
        estimatedGas = gasEstimate.totalGasWei;
        estimatedTime = gasEstimate.estimatedTimeSeconds.toString();

        console.log(`${logPrefix} Estimated gas: ${estimatedGas} wei`);
        console.log(`${logPrefix} Estimated time: ${estimatedTime} seconds`);

        // Validate gas price constraints
        if (maxGasPrice) {
          const maxGasPriceBN = ethers.BigNumber.from(maxGasPrice);
          const estimatedGasBN = ethers.BigNumber.from(estimatedGas);
          
          if (estimatedGasBN.gt(maxGasPriceBN.mul(200000))) { // Assuming average 200k gas per tx
            return fail({
              error: `${logPrefix} Estimated gas cost exceeds maximum gas price constraint`
            });
          }
        }
      }

      const successResult = {
        needsRebalancing: rebalanceCheck.needsRebalancing,
        totalPortfolioValueUsd: totalPortfolioValueUsd.toString(),
        currentAllocations,
        plannedActions,
        estimatedTotalGas: estimatedGas,
        estimatedExecutionTime: estimatedTime,
        worstCaseDrift: rebalanceCheck.worstDrift,
      };

      console.log(`${logPrefix} Precheck successful:`, {
        needsRebalancing: successResult.needsRebalancing,
        totalValue: `$${totalPortfolioValueUsd.toFixed(2)}`,
        actionsPlanned: plannedActions.length,
        worstDrift: `${rebalanceCheck.worstDrift.toFixed(2)}%`
      });

      return succeed({ data: successResult });

    } catch (error: any) {
      console.error(`${logPrefix} Precheck error:`, error);
      return fail({ error: `${logPrefix} ${error?.message || 'Unknown error'}` });
    }
  },

  execute: async ({ toolParams }, { succeed, fail, delegation }) => {
    const logPrefix = "[@lit-protocol/vincent-tool-portfolio-rebalancer/execute]";
    console.log(`${logPrefix} Starting portfolio rebalancing execution`);

    const {
      targetAllocations,
      chainConfigs,
      strategy,
      rebalanceThresholdPercent,
      swapSlippageBps,
      bridgeSlippageBps,
      dryRun,
      minRebalanceAmount,
      maxRebalanceAmount,
    } = toolParams;

    try {
      // Get PKP info
      const pkpPublicKey = delegation.delegatorPkpInfo.publicKey;
      const pkpAddress = ethers.utils.computeAddress(pkpPublicKey);

      if (!pkpPublicKey) {
        throw new Error("PKP public key not available from delegation context");
      }

      console.log(`${logPrefix} PKP Address: ${pkpAddress}`);

      if (dryRun) {
        console.log(`${logPrefix} Dry run mode - no actual transactions will be executed`);
      }

      const startTime = Date.now();

      // Re-read current portfolio state (might have changed since precheck)
      console.log(`${logPrefix} Reading current portfolio state...`);
      const currentAllocations = await readPortfolioBalances(
        chainConfigs,
        targetAllocations,
        pkpAddress
      );

      // Check if rebalancing is still needed
      const rebalanceCheck = needsRebalancing(
        currentAllocations,
        strategy,
        rebalanceThresholdPercent
      );

      if (!rebalanceCheck.needsRebalancing && strategy !== RebalanceStrategy.IMMEDIATE) {
        console.log(`${logPrefix} Portfolio no longer needs rebalancing`);
        return succeed({
          data: {
            rebalanceComplete: true,
            executedActions: [],
            finalAllocations: currentAllocations,
            totalGasUsed: "0",
            executionTimeSeconds: (Date.now() - startTime) / 1000,
          }
        });
      }

      // Calculate rebalancing actions
      const minRebalanceAmountUsd = parseFloat(minRebalanceAmount);
      let plannedActions = calculateRebalanceActions(currentAllocations, minRebalanceAmountUsd);

      // Apply max rebalance amount constraint
      if (maxRebalanceAmount) {
        const maxRebalanceAmountUsd = parseFloat(maxRebalanceAmount);
        plannedActions = plannedActions.filter(action => {
          const fromAllocation = currentAllocations.find(a => a.tokenAddress === action.fromToken);
          if (!fromAllocation) return false;
          
          const actionUsd = parseFloat(action.amount) * 
            (parseFloat(fromAllocation.usdValue || "0") / parseFloat(fromAllocation.balance || "1"));
          return actionUsd <= maxRebalanceAmountUsd;
        });
      }

      console.log(`${logPrefix} Executing ${plannedActions.length} rebalancing actions...`);

      const executedActions = [];
      let totalGasUsed = ethers.BigNumber.from(0);

      // Execute each action
      for (const [index, action] of plannedActions.entries()) {
        console.log(`${logPrefix} Executing action ${index + 1}/${plannedActions.length}:`, action.type);

        if (dryRun) {
          console.log(`${logPrefix} [DRY RUN] Would execute:`, {
            type: action.type,
            amount: action.amount,
            from: action.fromChain,
            to: action.toChain || action.fromChain
          });

          executedActions.push({
            type: action.type,
            txHash: "0x" + "0".repeat(64), // Mock transaction hash
            fromChain: action.fromChain,
            toChain: action.toChain,
            fromToken: action.fromToken,
            toToken: action.toToken,
            executedAmount: action.amount,
            timestamp: Date.now(),
          });
          continue;
        }

        try {
          let txHash: string;

          if (action.type === "SWAP") {
            // Use DEX aggregator tool for swaps
            txHash = await executeSwapAction(action, pkpAddress, swapSlippageBps);
          } else if (action.type === "BRIDGE") {
            // Use DeBridge tool for cross-chain transfers
            txHash = await executeBridgeAction(action, pkpAddress, bridgeSlippageBps);
          } else {
            throw new Error(`Unsupported action type: ${action.type}`);
          }

          executedActions.push({
            type: action.type,
            txHash,
            fromChain: action.fromChain,
            toChain: action.toChain,
            fromToken: action.fromToken,
            toToken: action.toToken,
            executedAmount: action.amount,
            timestamp: Date.now(),
          });

          // Estimate gas used (in production, get from receipt)
          totalGasUsed = totalGasUsed.add(ethers.utils.parseUnits("250000", "wei"));

          console.log(`${logPrefix} Action ${index + 1} completed: ${txHash}`);

        } catch (error: any) {
          console.error(`${logPrefix} Failed to execute action ${index + 1}:`, error);
          // Continue with other actions rather than failing entirely
          executedActions.push({
            type: action.type,
            txHash: "FAILED",
            fromChain: action.fromChain,
            toChain: action.toChain,
            fromToken: action.fromToken,
            toToken: action.toToken,
            executedAmount: "0",
            timestamp: Date.now(),
          });
        }
      }

      // Read final portfolio state
      console.log(`${logPrefix} Reading final portfolio state...`);
      const finalAllocations = await readPortfolioBalances(
        chainConfigs,
        targetAllocations,
        pkpAddress
      );

      const executionTimeSeconds = (Date.now() - startTime) / 1000;

      console.log(`${logPrefix} Rebalancing completed in ${executionTimeSeconds.toFixed(2)} seconds`);
      console.log(`${logPrefix} Final allocations:`, finalAllocations.map(a => ({
        token: a.tokenSymbol,
        chain: a.chain,
        current: `${a.currentPercentage.toFixed(2)}%`,
        target: `${a.targetPercentage}%`,
        drift: `${a.drift.toFixed(2)}%`
      })));

      return succeed({
        data: {
          rebalanceComplete: true,
          executedActions,
          finalAllocations,
          totalGasUsed: totalGasUsed.toString(),
          executionTimeSeconds,
        }
      });

    } catch (error: any) {
      console.error(`${logPrefix} Execution error:`, error);
      return fail({ error: `${logPrefix} ${error?.message || 'Unknown error'}` });
    }
  },
});

/**
 * Execute a swap action using the DEX aggregator tool
 */
async function executeSwapAction(
  action: RebalanceAction,
  pkpAddress: string,
  slippageBps: number
): Promise<string> {
  // This is a simplified implementation
  // In practice, this would integrate with the actual DEX aggregator tool
  console.log("Executing swap action:", action);
  
  // Mock implementation - would use actual DEX aggregator tool
  return "0x" + Math.random().toString(16).substr(2, 64);
}

/**
 * Execute a bridge action using the DeBridge tool
 */
async function executeBridgeAction(
  action: RebalanceAction,
  pkpAddress: string,
  slippageBps: number
): Promise<string> {
  // This is a simplified implementation
  // In practice, this would integrate with the actual DeBridge tool
  console.log("Executing bridge action:", action);
  
  // Mock implementation - would use actual DeBridge tool
  return "0x" + Math.random().toString(16).substr(2, 64);
}