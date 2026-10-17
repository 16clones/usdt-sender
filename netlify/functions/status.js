const { ethers } = require("ethers");

const SENDER_ADDRESS = "0x7d1Da224FA3ebB63132ddD7E80E6365512560fF4";

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const auth = event.headers["x-auth-token"];
  if (!process.env.APP_AUTH_TOKEN || auth !== process.env.APP_AUTH_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: "RPC_URL not configured" }) };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const ethBalWei = await provider.getBalance(SENDER_ADDRESS);
    const ethBalance = parseFloat(ethers.formatEther(ethBalWei)).toFixed(6);

    // Fetch ETH price from CoinGecko (matches Python script)
    let ethPrice = null;
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        { signal: AbortSignal.timeout(8000) }
      );
      const json = await res.json();
      ethPrice = json?.ethereum?.usd ?? null;
    } catch (_) {
      // Price fetch is optional — don't fail the whole request
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        wallet: SENDER_ADDRESS,
        ethBalance,
        ethPrice,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
