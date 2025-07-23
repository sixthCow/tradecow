import { createVincentPolicy } from "@lit-protocol/vincent-tool-sdk";
import { checkSendLimit, resetSendCounter } from "./helpers/index";
import {
  commitAllowResultSchema,
  commitDenyResultSchema,
  commitParamsSchema,
  evalAllowResultSchema,
  evalDenyResultSchema,
  precheckAllowResultSchema,
  precheckDenyResultSchema,
  toolParamsSchema,
  userParamsSchema,
} from "./schemas";
import { counterSignatures } from "./abi/counterSignatures";
import { laUtils } from "@lit-protocol/vincent-scaffold-sdk";

export const vincentPolicy = createVincentPolicy({
  packageName: "@lit-protocol/vincent-policy-send-counter-limit" as const,

  toolParamsSchema,
  userParamsSchema,
  commitParamsSchema,

  precheckAllowResultSchema,
  precheckDenyResultSchema,

  evalAllowResultSchema,
  evalDenyResultSchema,

  commitAllowResultSchema,
  commitDenyResultSchema,

  precheck: async (
    { toolParams, userParams },
    { allow, deny, appId, delegation: { delegatorPkpInfo } }
  ) => {
    console.log(
      "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🔍 POLICY PRECHECK CALLED"
    );
    console.log(
      "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🔍 Policy precheck params:",
      {
        toolParams,
        userParams,
        ethAddress: delegatorPkpInfo.ethAddress,
        appId,
      }
    );

    // Only use what we actually need - no defaults in policy logic
    const { maxSends, timeWindowSeconds } = userParams;
    const { ethAddress } = delegatorPkpInfo;

    try {
      // Convert BigInt to number for helper function
      const maxSendsNum = Number(maxSends);
      const timeWindowSecondsNum = Number(timeWindowSeconds);

      // Check current send limit for the user
      const limitCheck = await checkSendLimit(
        ethAddress,
        maxSendsNum,
        timeWindowSecondsNum
      );

      if (!limitCheck.allowed) {
        const denyResult = {
          reason: `Send limit exceeded. Maximum ${Number(
            maxSends
          )} sends per ${Number(timeWindowSeconds)} seconds. Try again in ${
            limitCheck.secondsUntilReset
          } seconds.`,
          currentCount: limitCheck.currentCount,
          maxSends: Number(maxSends),
          secondsUntilReset: limitCheck.secondsUntilReset || 0,
        };

        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 POLICY PRECHECK DENYING REQUEST:"
        );
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 Deny result:",
          JSON.stringify(denyResult, null, 2)
        );
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 Current count:",
          limitCheck.currentCount
        );
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 Max sends:",
          Number(maxSends)
        );
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 Limit check result:",
          JSON.stringify(limitCheck, null, 2)
        );
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 About to call deny() function..."
        );

        const denyResponse = deny(denyResult);
        console.log(
          "[@lit-protocol/vincent-policy-send-counter-limit/precheck] 🚫 POLICY PRECHECK DENY RESPONSE:",
          JSON.stringify(denyResponse, null, 2)
        );
        return denyResponse;
      }

      const allowResult = {
        currentCount: limitCheck.currentCount,
        maxSends: Number(maxSends),
        remainingSends: limitCheck.remainingSends,
        timeWindowSeconds: Number(timeWindowSeconds),
      };

      console.log(
        "[SendLimitPolicy/precheck] ✅ POLICY PRECHECK ALLOWING REQUEST:"
      );
      console.log(
        "[SendLimitPolicy/precheck] ✅ Allow result:",
        JSON.stringify(allowResult, null, 2)
      );
      console.log(
        "[SendLimitPolicy/precheck] ✅ Current count:",
        limitCheck.currentCount
      );
      console.log("[SendLimitPolicy/precheck] ✅ Max sends:", Number(maxSends));
      console.log(
        "[SendLimitPolicy/precheck] ✅ Remaining sends:",
        limitCheck.remainingSends
      );

      const allowResponse = allow(allowResult);
      console.log(
        "[SendLimitPolicy/precheck] ✅ POLICY PRECHECK ALLOW RESPONSE:",
        JSON.stringify(allowResponse, null, 2)
      );
      return allowResponse;
    } catch (error) {
      console.error("[SendLimitPolicy/precheck] Error in precheck:", error);
      return deny({
        reason: `Policy error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        currentCount: 0,
        maxSends: Number(maxSends),
        secondsUntilReset: 0,
      });
    }
  },

  evaluate: async (
    { toolParams, userParams },
    { allow, deny, appId, delegation: { delegatorPkpInfo } }
  ) => {
    console.log(
      "[@lit-protocol/vincent-policy-send-counter-limit/evaluate] Evaluating send limit policy",
      {
        toolParams,
        userParams,
      }
    );

    // Only use what we actually need - no defaults in policy logic
    const { maxSends, timeWindowSeconds } = userParams;
    const { ethAddress } = delegatorPkpInfo;

    const checkSendResponse = await Lit.Actions.runOnce(
      { waitForResponse: true, name: "checkSendLimit" },
      async () => {
        try {
          // Convert BigInt to number for helper function
          const maxSendsNum = Number(maxSends);
          const timeWindowSecondsNum = Number(timeWindowSeconds);

          const limitCheck = await checkSendLimit(
            ethAddress,
            maxSendsNum,
            timeWindowSecondsNum
          );

          return JSON.stringify({
            status: "success",
            ...limitCheck,
          });
        } catch (error) {
          return JSON.stringify({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    const parsedResponse = JSON.parse(checkSendResponse);
    if (parsedResponse.status === "error") {
      return deny({
        reason: `Error checking send limit: ${parsedResponse.error} (evaluate)`,
        currentCount: 0,
        maxSends: Number(maxSends),
        secondsUntilReset: 0,
        timeWindowSeconds: Number(timeWindowSeconds),
      });
    }

    const { allowed, currentCount, remainingSends, secondsUntilReset } =
      parsedResponse;

    if (!allowed) {
      return deny({
        reason: `Send limit exceeded during evaluation. Maximum ${Number(
          maxSends
        )} sends per ${Number(
          timeWindowSeconds
        )} seconds. Try again in ${secondsUntilReset} seconds.`,
        currentCount,
        maxSends: Number(maxSends),
        secondsUntilReset: secondsUntilReset || 0,
      });
    }

    console.log(
      "[@lit-protocol/vincent-policy-send-counter-limit/evaluate] Evaluated send limit policy",
      {
        currentCount,
        maxSends,
        remainingSends,
      }
    );

    return allow({
      currentCount,
      maxSends: Number(maxSends),
      remainingSends,
      timeWindowSeconds: Number(timeWindowSeconds),
    });
  },

  commit: async (
    { currentCount, maxSends, timeWindowSeconds },
    { allow, appId, delegation: { delegatorPkpInfo } }
  ) => {
    const { ethAddress } = delegatorPkpInfo;

    console.log(
      "[@lit-protocol/vincent-policy-send-counter-limit/commit] 🚀 IM COMMITING!"
    );

    // Check if we need to reset the counter first
    const checkResponse = await checkSendLimit(
      ethAddress,
      maxSends,
      Number(timeWindowSeconds)
    );

    if (checkResponse.shouldReset) {
      console.log(
        `[@lit-protocol/vincent-policy-send-counter-limit/commit] Resetting counter for ${ethAddress} due to time 
      window expiration`
      );
      try {
        await resetSendCounter(ethAddress, delegatorPkpInfo.publicKey);
        console.log(
          `[@lit-protocol/vincent-policy-send-counter-limit/commit] Counter reset successful for ${ethAddress}`
        );
      } catch (error) {
        console.warn(`Counter reset failed for ${ethAddress}:`, error);
        // Continue anyway, the counter will still work
      }
    }

    try {
      // Record the send to the smart contract
      console.log(
        `[@lit-protocol/vincent-policy-send-counter-limit/commit] Recording send to contract for ${ethAddress} (appId: ${appId})`
      );

      // Execute the contract call to increment the counter directly
      console.log(
        `[@lit-protocol/vincent-policy-send-counter-limit/commit] Calling incrementByAddress(${ethAddress}) on contract ${counterSignatures.address}`
      );

      const provider = await Lit.Actions.getRpcUrl({ chain: "yellowstone" });

      // Call contract directly without Lit.Actions.runOnce wrapper
      const txHash = await laUtils.transaction.handler.contractCall({
        provider,
        pkpPublicKey: delegatorPkpInfo.publicKey,
        callerAddress: ethAddress,
        abi: [counterSignatures.methods.increment],
        contractAddress: counterSignatures.address,
        functionName: "increment",
        args: [],
        overrides: {
          gasLimit: 100000,
        },
      });

      const newCount = currentCount + 1;
      const remainingSends = Number(maxSends) - newCount;

      console.log(
        "[@lit-protocol/vincent-policy-send-counter-limit/commit] Policy commit successful",
        {
          ethAddress,
          newCount,
          maxSends,
          remainingSends,
          txHash,
        }
      );

      return allow({
        recorded: true,
        newCount,
        remainingSends: Math.max(0, remainingSends),
      });
    } catch (error) {
      console.error(
        "[@lit-protocol/vincent-policy-send-counter-limit/commit] Error in commit phase:",
        error
      );
      // Still return success since the transaction itself succeeded
      return allow({
        recorded: false,
        newCount: currentCount + 1,
        remainingSends: Math.max(0, Number(maxSends) - currentCount - 1),
      });
    }
  },
});
