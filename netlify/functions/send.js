const { ethers } = require("ethers");

// USDT mainnet
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_DECIMALS = 6;

const USDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

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

  // Read secrets from env (set in Netlify dashboard)
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  if (!privateKey || !rpcUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured (PRIVATE_KEY / RPC_URL missing)" }) };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

    const value = ethers.parseUnits(amt.toString(), USDT_DECIMALS);

    // Pre-flight: USDT balance
    const bal = await usdt.balanceOf(wallet.address);
    if (bal < value) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Insufficient USDT. Have ${ethers.formatUnits(bal, USDT_DECIMALS)}, need ${amt}`,
        }),
      };
    }

    // Pre-flight: ETH for gas
    const ethBal = await provider.getBalance(wallet.address);
    if (ethBal === 0n) {
      return { statusCode: 400, body: JSON.stringify({ error: "No ETH for gas" }) };
    }

    // Send
    const tx = await usdt.transfer(recipient, value);
    const receipt = await tx.wait();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: receipt.status === 1,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        from: wallet.address,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};