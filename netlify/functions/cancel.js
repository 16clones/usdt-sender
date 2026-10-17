const { ethers } = require("ethers");

const SENDER_ADDRESS = "0x7d1Da224FA3ebB63132ddD7E80E6365512560fF4";

// Cancel gas: 0.4 gwei — high enough to replace the 0.01 gwei pending tx
// Matches cancel_all_pending_transactions() in the Python script
const CANCEL_GAS_GWEI = 0.4;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const auth = event.headers["x-auth-token"];
  if (!process.env.APP_AUTH_TOKEN || auth !== process.env.APP_AUTH_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  if (!privateKey || !rpcUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured (PRIVATE_KEY / RPC_URL missing)" }) };
  }

  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (normalizedKey.length !== 66) {
    return { statusCode: 500, body: JSON.stringify({ error: "Invalid PRIVATE_KEY length" }) };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);

    // Find pending nonces: anything between latest confirmed and latest pending
    const latestNonce = await provider.getTransactionCount(wallet.address, "latest");
    const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");

    if (pendingNonce <= latestNonce) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No pending transactions to cancel.", cancelled: [] }),
      };
    }

    const maxFeePerGas = ethers.parseUnits(CANCEL_GAS_GWEI.toString(), "gwei");
    const maxPriorityFeePerGas = ethers.parseUnits(CANCEL_GAS_GWEI.toString(), "gwei");

    const cancelled = [];
    const errors = [];

    // Send a 0-value self-transfer for each pending nonce to replace it
    for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
      try {
        const tx = await wallet.sendTransaction({
          to: wallet.address,   // send to self
          value: 0n,
          gasLimit: 21000,
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce,
          type: 2,              // EIP-1559
        });

        cancelled.push({
          nonce,
          txHash: tx.hash,
          etherscanUrl: `https://etherscan.io/tx/${tx.hash}`,
        });
      } catch (err) {
        errors.push({ nonce, error: err.message || String(err) });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        cancelled,
        errors,
        message: `Cancelled ${cancelled.length} transaction(s)${errors.length ? `, ${errors.length} failed` : ""}.`,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
