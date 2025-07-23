import {
  createAppConfig,
  init,
  suppressLitLogs,
} from "@lit-protocol/vincent-scaffold-sdk/e2e";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Apply log suppression FIRST, before any imports that might trigger logs
suppressLitLogs(true);

import { getVincentToolClient } from "@lit-protocol/vincent-app-sdk";
// Tools and Policies that we will be testing
import { vincentPolicyMetadata as sendLimitPolicyMetadata } from "../../vincent-packages/policies/send-counter-limit/dist/index.js";
import { bundledVincentTool as dexAggregatorTool } from "../../vincent-packages/tools/dex-aggregator/dist/index.js";
import { bundledVincentTool as erc20ApproveTool } from "@lit-protocol/vincent-tool-erc20-approval";
import { ethers } from "ethers";
import {
  setupWethFunding,
  setupEthFunding,
  addTestResult,
  printTestSummary,
} from "./test-utils.js";

// ========================================
// NETWORK CONFIGURATION - CHANGE THIS TO TEST ON OTHER NETWORKS
// ========================================
const NETWORK_NAME = "base"; // Options: "base", "arbitrum", "ethereum"

const NETWORK_CONFIG = {
  // Network to test on
  network: NETWORK_NAME,

  // Chain ID for the network
  chainId: NETWORK_NAME === "base" ? 8453 : NETWORK_NAME === "arbitrum" ? 42161 : 1,

  // RPC URL environment variable
  rpcUrlEnv: `${NETWORK_NAME.toUpperCase()}_RPC_URL`,

  // Token addresses for testing
  tokens: {
    base: {
      WETH: "0x4200000000000000000000000000000000000006",
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    },
    arbitrum: {
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    ethereum: {
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      USDC: "0xA0b86a33E6417c4c6b4c6b4c6b4c6b4c6b4c6b4c",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
  },

  get currentTokens() {
    return this.tokens[NETWORK_NAME as keyof typeof this.tokens];
  },
} as const;

const CONFIRMATIONS_TO_WAIT = 2;

// Test amounts
const WETH_FUNDING_AMOUNT = "0.01"; // 0.01 WETH for testing
const SWAP_AMOUNT = "0.001"; // 0.001 WETH to swap for USDC

(async () => {
  /**
   * ====================================
   * Initialise the environment
   * ====================================
   */
  const { accounts, chainClient } = await init({
    network: "datil",
    deploymentStatus: "dev",
  });

  const rpcUrl = process.env[NETWORK_CONFIG.rpcUrlEnv];
  if (!rpcUrl) {
    throw new Error(
      `${NETWORK_CONFIG.rpcUrlEnv} is not set - can't test on ${NETWORK_CONFIG.network} without an RPC URL`
    );
  }

  if (!process.env.TEST_FUNDER_PRIVATE_KEY) {
    throw new Error(
      `TEST_FUNDER_PRIVATE_KEY is not set - can't test on ${NETWORK_CONFIG.network} without a funder private key`
    );
  }

  const networkProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

  /**
   * ====================================
   * (🫵 You) Prepare the tools and policies
   * ====================================
   */

  const dexAggregatorToolClient = getVincentToolClient({
    bundledVincentTool: dexAggregatorTool,
    ethersSigner: accounts.delegatee.ethersWallet,
  });

  const approveToolClient = getVincentToolClient({
    bundledVincentTool: erc20ApproveTool,
    ethersSigner: accounts.delegatee.ethersWallet,
  });

  /**
   * ====================================
   * Prepare the IPFS CIDs for the tools and policies
   * NOTE: All arrays below are parallel - each index corresponds to the same tool.
   * ❗️If you change the policy parameter values, you will need to reset the state file.
   * You can do this by running: npm run vincent:reset
   * ====================================
   */
  const appConfig = createAppConfig(
    {
      toolIpfsCids: [
        dexAggregatorTool.ipfsCid,
        erc20ApproveTool.ipfsCid,
      ],
      toolPolicies: [
        [
          // No policies for DEX aggregator tool for now
        ],
        [
          // No policies for ERC20 Approval tool
        ],
      ],
      toolPolicyParameterNames: [
        [], // No policy parameter names for dexAggregatorTool
        [], // No policy parameter names for approveTool
      ],
      toolPolicyParameterTypes: [
        [], // No policy parameter types for dexAggregatorTool
        [], // No policy parameter types for approveTool
      ],
      toolPolicyParameterValues: [
        [], // No policy parameter values for dexAggregatorTool
        [], // No policy parameter values for approveTool
      ],
    },

    // Debugging options
    {
      cidToNameMap: {
        [dexAggregatorTool.ipfsCid]: "DEX Aggregator Tool",
        [sendLimitPolicyMetadata.ipfsCid]: "Send Limit Policy",
        [erc20ApproveTool.ipfsCid]: "ERC20 Approval Tool",
      },
      debug: true,
    }
  );

  /**
   * Collect all IPFS CIDs for tools and policies that need to be:
   * 1. Authorised during agent wallet PKP minting
   * 2. Permitted as authentication methods for the PKP
   */
  const toolAndPolicyIpfsCids = [
    dexAggregatorTool.ipfsCid,
    erc20ApproveTool.ipfsCid,
    sendLimitPolicyMetadata.ipfsCid,
  ];

  /**
   * ====================================
   * 👦🏻 (Agent Wallet PKP Owner) mint an Agent Wallet PKP
   * ====================================
   */
  const agentWalletPkp = await accounts.agentWalletPkpOwner.mintAgentWalletPkp({
    toolAndPolicyIpfsCids: toolAndPolicyIpfsCids,
  });
  console.log("toolAndPolicyIpfsCids", toolAndPolicyIpfsCids);
  console.log("appConfig.TOOL_IPFS_CIDS", appConfig.TOOL_IPFS_CIDS);

  console.log("🤖 Agent Wallet PKP:", agentWalletPkp);

  /**
   * ====================================
   * 🦹‍♀️ (App Manager Account) Register Vincent app with delegatee
   * ====================================
   */
  const { appId, appVersion } = await chainClient.registerApp({
    toolIpfsCids: appConfig.TOOL_IPFS_CIDS,
    toolPolicies: appConfig.TOOL_POLICIES,
    toolPolicyParameterNames: appConfig.TOOL_POLICY_PARAMETER_NAMES,
    toolPolicyParameterTypes: appConfig.TOOL_POLICY_PARAMETER_TYPES,
  });

  console.log("✅ Vincent app registered:", { appId, appVersion });

  /**
   * ====================================
   * 👦🏻 (Agent Wallet PKP Owner) Permit PKP to use the app version
   * ====================================
   */
  await chainClient.permitAppVersion({
    pkpTokenId: agentWalletPkp.tokenId,
    appId,
    appVersion,
    toolIpfsCids: appConfig.TOOL_IPFS_CIDS,
    policyIpfsCids: appConfig.TOOL_POLICIES,
    policyParameterNames: appConfig.TOOL_POLICY_PARAMETER_NAMES,
    policyParameterValues: appConfig.TOOL_POLICY_PARAMETER_VALUES,
    policyParameterTypes: appConfig.TOOL_POLICY_PARAMETER_TYPES,
  });

  console.log("✅ PKP permitted to use app version");

  /**
   * ====================================
   * 👦🏻 (Agent Wallet PKP Owner) Permit auth methods for the agent wallet PKP
   * ====================================
   */
  const permittedAuthMethodsTxHashes =
    await accounts.agentWalletPkpOwner.permittedAuthMethods({
      agentWalletPkp: agentWalletPkp,
      toolAndPolicyIpfsCids: toolAndPolicyIpfsCids,
    });

  console.log(
    "✅ Permitted Auth Methods Tx hashes:",
    permittedAuthMethodsTxHashes
  );

  /**
   * ====================================
   * Validate tool permissions (debugging)
   * ====================================
   */
  // Test 1: DEX Aggregator Tool Validation
  try {
    let validation = await chainClient.validateToolExecution({
      delegateeAddress: accounts.delegatee.ethersWallet.address,
      pkpTokenId: agentWalletPkp.tokenId,
      toolIpfsCid: dexAggregatorTool.ipfsCid,
    });

    console.log("✅ DEX Aggregator Tool execution validation:", validation);

    if (!validation.isPermitted) {
      throw new Error(
        `Delegatee is not permitted to execute DEX aggregator tool for PKP for IPFS CID: ${
          dexAggregatorTool.ipfsCid
        }. Validation: ${JSON.stringify(validation, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )}`
      );
    }
    addTestResult("DEX Aggregator Tool Validation", true);
  } catch (error) {
    addTestResult("DEX Aggregator Tool Validation", false, error.message);
  }

  // ========================================
  // WETH and ETH Funding Setup
  // ========================================
  const { wethContract, wethDecimals } = await setupWethFunding(
    networkProvider,
    agentWalletPkp.ethAddress,
    process.env.TEST_FUNDER_PRIVATE_KEY,
    addTestResult,
    CONFIRMATIONS_TO_WAIT,
    NETWORK_CONFIG.network,
    WETH_FUNDING_AMOUNT
  );

  await setupEthFunding(
    networkProvider,
    agentWalletPkp.ethAddress,
    process.env.TEST_FUNDER_PRIVATE_KEY,
    addTestResult,
    CONFIRMATIONS_TO_WAIT,
    NETWORK_CONFIG.network,
    "0.002" // 0.002 ETH for gas fees
  );

  // Setup USDC contract for balance checking
  const usdcContract = new ethers.Contract(
    NETWORK_CONFIG.currentTokens.USDC,
    [
      {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "decimals",
        outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    networkProvider
  );

  const usdcDecimals = await usdcContract.decimals();

  // ========================================
  // DEX Aggregator Tool Testing - Complete Workflow
  // ========================================
  console.log("🧪 Testing DEX Aggregator Tool - WETH to USDC Swap");
  console.log(
    `📋 Workflow: Approve WETH → Swap ${SWAP_AMOUNT} WETH for USDC on ${NETWORK_CONFIG.network}`
  );

  // Store initial balances for comparison
  let initialWethBalance: ethers.BigNumber = ethers.BigNumber.from(0);
  let initialUsdcBalance: ethers.BigNumber = ethers.BigNumber.from(0);

  // Test: Initial Balance Check
  try {
    console.log("🔍 Recording initial token balances...");

    // Get initial balances
    initialWethBalance = await wethContract.balanceOf(agentWalletPkp.ethAddress);
    initialUsdcBalance = await usdcContract.balanceOf(agentWalletPkp.ethAddress);

    const initialWethFormatted = ethers.utils.formatEther(initialWethBalance);
    const initialUsdcFormatted = ethers.utils.formatUnits(
      initialUsdcBalance,
      usdcDecimals
    );

    console.log(`   Initial WETH balance: ${initialWethFormatted} WETH`);
    console.log(`   Initial USDC balance: ${initialUsdcFormatted} USDC`);

    // Verify PKP has sufficient WETH for the test
    const requiredWethBalance = ethers.utils.parseEther(SWAP_AMOUNT);
    if (initialWethBalance.lt(requiredWethBalance)) {
      throw new Error(
        `Insufficient WETH balance. Required: ${SWAP_AMOUNT} WETH, Available: ${initialWethFormatted} WETH`
      );
    }

    addTestResult("Initial Balance Check", true);
  } catch (error) {
    console.error("❌ Initial balance check failed:", error.message);
    addTestResult("Initial Balance Check", false, error.message);
  }

  // ========================================
  // STEP 1: Get Quote (Precheck)
  // ========================================
  console.log("🔍 (STEP 1) Getting swap quote via DEX Aggregator precheck");

  let routerAddress: string = "";
  let estimatedOutput: string = "";

  try {
    const swapPrecheckParams = {
      fromTokenAddress: NETWORK_CONFIG.currentTokens.WETH,
      toTokenAddress: NETWORK_CONFIG.currentTokens.USDC,
      amount: SWAP_AMOUNT,
      chain: NETWORK_CONFIG.network,
      slippageBps: 100, // 1% slippage
      rpcUrl: rpcUrl,
    };

    const swapPrecheck = await dexAggregatorToolClient.precheck(
      swapPrecheckParams,
      {
        delegatorPkpEthAddress: agentWalletPkp.ethAddress,
      }
    );

    console.log(
      "(DEX-AGGREGATOR-PRECHECK): ",
      JSON.stringify(swapPrecheck, null, 2)
    );

    if (swapPrecheck.success && !("error" in swapPrecheck.result)) {
      console.log("✅ DEX Aggregator precheck passed");
      
      routerAddress = swapPrecheck.result.routerAddress;
      estimatedOutput = swapPrecheck.result.estimatedToAmount;
      
      console.log(`   Router Address: ${routerAddress}`);
      console.log(`   Estimated USDC Output: ${ethers.utils.formatUnits(estimatedOutput, usdcDecimals)} USDC`);
      console.log(`   DEX: ${swapPrecheck.result.dexName}`);
      console.log(`   Price Impact: ${swapPrecheck.result.priceImpact}%`);

      addTestResult("DEX Aggregator Quote", true);
    } else {
      const errorMsg = `DEX Aggregator precheck failed: ${
        "error" in swapPrecheck ? swapPrecheck.error : "Unknown precheck error"
      }`;
      console.log("❌ DEX Aggregator precheck failed:", errorMsg);
      addTestResult("DEX Aggregator Quote", false, errorMsg);
      return; // Exit if we can't get a quote
    }
  } catch (error) {
    const errorMsg = `DEX Aggregator precheck threw exception: ${
      error.message || error
    }`;
    console.log("❌ DEX Aggregator precheck unexpected error:", errorMsg);
    addTestResult("DEX Aggregator Quote", false, errorMsg);
    return;
  }

  // ========================================
  // STEP 2: Approve WETH for Router
  // ========================================
  console.log("🛂 (STEP 2) Approving WETH for DEX Router via ERC20 Approval Tool");

  try {
    const approveWethParams = {
      chainId: NETWORK_CONFIG.chainId,
      tokenAddress: NETWORK_CONFIG.currentTokens.WETH,
      spenderAddress: routerAddress,
      tokenAmount: parseFloat(SWAP_AMOUNT),
      tokenDecimals: wethDecimals,
      rpcUrl: rpcUrl,
    };

    const approveWethPrecheck = await approveToolClient.precheck(
      approveWethParams,
      {
        delegatorPkpEthAddress: agentWalletPkp.ethAddress,
      }
    );

    console.log(
      "(APPROVE-PRECHECK-WETH): ",
      JSON.stringify(approveWethPrecheck, null, 2)
    );

    if (approveWethPrecheck.success) {
      const approveWethExecute = await approveToolClient.execute(
        approveWethParams,
        {
          delegatorPkpEthAddress: agentWalletPkp.ethAddress,
        }
      );

      console.log(
        "(APPROVE-EXECUTE-WETH): ",
        JSON.stringify(approveWethExecute, null, 2)
      );

      if (approveWethExecute.success) {
        console.log("✅ WETH approval executed successfully");
        if (approveWethExecute.result.approvalTxHash) {
          console.log(
            "🔍 Waiting for WETH approval transaction confirmation..."
          );
          const receipt = await networkProvider.waitForTransaction(
            approveWethExecute.result.approvalTxHash,
            CONFIRMATIONS_TO_WAIT,
            180000
          );
          if (receipt.status === 0) {
            throw new Error(
              `WETH approval transaction reverted: ${approveWethExecute.result.approvalTxHash}`
            );
          }
          console.log(
            `   WETH approval confirmed in block ${receipt.blockNumber}`
          );
        }
        addTestResult("ERC20 Approve WETH for DEX", true);
      } else {
        console.log("❌ WETH approval execution failed:", approveWethExecute);
        addTestResult(
          "ERC20 Approve WETH for DEX",
          false,
          JSON.stringify(approveWethExecute, null, 2)
        );
      }
    } else {
      const errMsg = approveWethPrecheck.error || "Unknown precheck error";
      console.log("❌ WETH approval precheck failed:", errMsg);
      addTestResult("ERC20 Approve WETH for DEX", false, errMsg);
    }
  } catch (error) {
    console.log("❌ WETH approval unexpected error:", error.message || error);
    addTestResult(
      "ERC20 Approve WETH for DEX",
      false,
      error.message || error.toString()
    );
  }

  // ========================================
  // STEP 3: Execute Swap
  // ========================================
  console.log("💱 (STEP 3) Execute WETH to USDC swap via DEX Aggregator");

  try {
    const swapExecuteParams = {
      fromTokenAddress: NETWORK_CONFIG.currentTokens.WETH,
      toTokenAddress: NETWORK_CONFIG.currentTokens.USDC,
      amount: SWAP_AMOUNT,
      chain: NETWORK_CONFIG.network,
      slippageBps: 100, // 1% slippage
    };

    const swapExecute = await dexAggregatorToolClient.execute(
      swapExecuteParams,
      {
        delegatorPkpEthAddress: agentWalletPkp.ethAddress,
      }
    );

    console.log(
      "(DEX-AGGREGATOR-EXECUTE): ",
      JSON.stringify(swapExecute, null, 2)
    );

    if (swapExecute.success) {
      console.log("✅ DEX Aggregator swap completed successfully!");
      console.log(`   Tx hash: ${swapExecute.result.txHash}`);
      console.log(`   DEX used: ${swapExecute.result.dexName}`);

      // Wait for transaction confirmation
      const receipt = await networkProvider.waitForTransaction(
        swapExecute.result.txHash,
        CONFIRMATIONS_TO_WAIT,
        180000
      );
      if (receipt.status === 0) {
        throw new Error(
          `DEX swap transaction reverted: ${swapExecute.result.txHash}`
        );
      }
      console.log(
        `   ✅ Swap transaction confirmed in block ${receipt.blockNumber}`
      );

      // Verify balances after swap
      try {
        console.log("🔍 Verifying balances after swap...");

        const postSwapWethBalance = await wethContract.balanceOf(
          agentWalletPkp.ethAddress
        );
        const postSwapUsdcBalance = await usdcContract.balanceOf(
          agentWalletPkp.ethAddress
        );

        const postSwapWethFormatted = ethers.utils.formatEther(postSwapWethBalance);
        const postSwapUsdcFormatted = ethers.utils.formatUnits(
          postSwapUsdcBalance,
          usdcDecimals
        );

        console.log(`   Post-swap WETH balance: ${postSwapWethFormatted} WETH`);
        console.log(`   Post-swap USDC balance: ${postSwapUsdcFormatted} USDC`);

        // Check WETH decreased
        const wethDecrease = initialWethBalance.sub(postSwapWethBalance);
        const expectedWethDecrease = ethers.utils.parseEther(SWAP_AMOUNT);
        
        if (wethDecrease.gte(expectedWethDecrease)) {
          console.log("✅ WETH balance correctly decreased");
        } else {
          console.log("⚠️  WETH balance decrease less than expected");
        }

        // Check USDC increased
        const usdcIncrease = postSwapUsdcBalance.sub(initialUsdcBalance);
        
        if (usdcIncrease.gt(0)) {
          console.log(`✅ USDC balance increased by ${ethers.utils.formatUnits(usdcIncrease, usdcDecimals)} USDC`);
          addTestResult("DEX Aggregator Swap Execution", true);
        } else {
          const errorMsg = "USDC balance did not increase after swap";
          console.log(`❌ ${errorMsg}`);
          addTestResult("DEX Aggregator Swap Execution", false, errorMsg);
        }
      } catch (balanceError) {
        console.log(
          "❌ Could not verify balances after swap:",
          balanceError.message
        );
        addTestResult(
          "DEX Aggregator Swap Execution",
          false,
          `Balance verification failed: ${balanceError.message}`
        );
      }
    } else {
      const errorMsg = `DEX Aggregator swap execution failed: ${
        swapExecute.error || "Unknown execution error"
      }`;
      console.log("❌ DEX Aggregator swap failed:", errorMsg);
      addTestResult("DEX Aggregator Swap Execution", false, errorMsg);
    }
  } catch (error) {
    const errorMsg = `DEX Aggregator swap operation threw exception: ${
      error.message || error
    }`;
    console.log("❌ DEX Aggregator swap unexpected error:", errorMsg);
    addTestResult("DEX Aggregator Swap Execution", false, errorMsg);
  }

  // ========================================
  // Print Test Summary and Exit
  // ========================================
  const allTestsPassed = printTestSummary();
  process.exit(allTestsPassed ? 0 : 1);
})();