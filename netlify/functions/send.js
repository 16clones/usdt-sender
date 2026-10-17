const { ethers } = require("ethers");

// USDT mainnet
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_DECIMALS = 6;

const USDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

// Fixed sender wallet (matches the Python script)
const SENDER_ADDRESS = "0x7d1Da224FA3ebB63132ddD7E80E6365512560fF4";

// Gas strategy: fixed at 0.01 gwei (keeps transaction pending, ~$0.01 fee)
// Matches calculate_gas_for_one_cent() in the Python script
const GAS_PRICE_GWEI = 0.01;
const GAS_LIMIT = 70000;

exports.handler = async (event) => {
  // Only POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Optional: simple shared-secret auth so randoms can't trigger sends
  const auth = event.headers["x-auth-token"];
  if (!process.env.APP_AUTH_TOKEN || auth !== process.env.APP_AUTH_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { recipient, amount } = body;

  if (!recipient || !ethers.isAddress(recipient)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid recipient address" }) };
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid amount" }) };
  }

  // Read private key from env (set in Netlify dashboard)
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  if (!privateKey || !rpcUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured (PRIVATE_KEY / RPC_URL missing)" }) };
  }

  // Normalize private key: ensure it has 0x prefix for ethers.js
  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (normalizedKey.length !== 66) {
    return { statusCode: 500, body: JSON.stringify({ error: "Invalid PRIVATE_KEY length (expected 64 hex chars)" }) };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(normalizedKey, provider);

    // Verify the wallet address matches the expected sender
    if (wallet.address.toLowerCase() !== SENDER_ADDRESS.toLowerCase()) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Private key does not match expected sender address ${SENDER_ADDRESS}`,
        }),
      };
    }

    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);
    const value = ethers.parseUnits(amt.toString(), USDT_DECIMALS);

    // Pre-flight: ETH for gas
    const ethBal = await provider.getBalance(wallet.address);
    if (ethBal === 0n) {
      return { statusCode: 400, body: JSON.stringify({ error: "No ETH for gas" }) };
    }

    // Fixed 0.01 gwei gas price (EIP-1559) — keeps tx pending cheaply
    // Matches calculate_gas_for_one_cent() in the Python script
    const maxFeePerGas = ethers.parseUnits(GAS_PRICE_GWEI.toString(), "gwei");
    const maxPriorityFeePerGas = ethers.parseUnits(GAS_PRICE_GWEI.toString(), "gwei");

    // Get nonce (use 'pending' to account for any queued txs, matching Python)
    const nonce = await provider.getTransactionCount(wallet.address, "pending");

    // Build and send transaction with explicit EIP-1559 gas params
    const tx = await usdt.transfer(recipient, value, {
      gasLimit: GAS_LIMIT,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      type: 2, // EIP-1559
    });

    // Do NOT await tx.wait() — at 0.01 gwei the tx intentionally stays pending
    // Return the hash immediately so the client can track it on Etherscan
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        txHash: tx.hash,
        from: wallet.address,
        nonce,
        gasGwei: GAS_PRICE_GWEI,
        etherscanUrl: `https://etherscan.io/tx/${tx.hash}`,
        note: "Transaction submitted at 0.01 gwei — will remain pending until mined or cancelled.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};