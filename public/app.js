const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");
const walletStatusEl = document.getElementById("wallet-status");

function showStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

// Load wallet status (ETH balance + price) once a valid-looking token is entered
async function loadWalletStatus(auth) {
  if (!auth) return;

  try {
    const res = await fetch("/.netlify/functions/status", {
      headers: { "x-auth-token": auth },
    });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("wallet-addr").textContent =
      data.wallet.slice(0, 6) + "..." + data.wallet.slice(-4);
    document.getElementById("wallet-eth").textContent =
      data.ethBalance + " ETH";

    if (data.ethPrice) {
      document.getElementById("wallet-price").textContent =
        "$" + data.ethPrice.toLocaleString();
      document.getElementById("price-row").style.display = "";
    }

    walletStatusEl.classList.remove("hidden");
  } catch (_) {
    // silently ignore — status panel is informational only
  }
}

// Load wallet status when user finishes typing the token (on blur)
document.getElementById("auth").addEventListener("blur", (e) => {
  loadWalletStatus(e.target.value.trim());
});

sendBtn.addEventListener("click", async () => {
  const auth = document.getElementById("auth").value.trim();
  const recipient = document.getElementById("recipient").value.trim();
  const amount = document.getElementById("amount").value.trim();

  if (!auth) return showStatus("Enter the access token.", "error");
  if (!recipient) return showStatus("Enter a recipient address.", "error");
  if (!amount || parseFloat(amount) <= 0) return showStatus("Enter a valid amount.", "error");

  sendBtn.disabled = true;
  showStatus("Sending...", "info");

  try {
    const res = await fetch("/.netlify/functions/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-token": auth,
      },
      body: JSON.stringify({ recipient, amount }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showStatus("Failed: " + (data.error || "unknown error"), "error");
    } else {
      showStatus(
        `✅ Sent! (pending at ${data.gasGwei} gwei)\nTx: ${data.txHash}\nEtherscan: ${data.etherscanUrl}`,
        "success"
      );
      // Refresh ETH balance after send
      loadWalletStatus(auth);
    }
  } catch (err) {
    showStatus("Request failed: " + err.message, "error");
  } finally {
    sendBtn.disabled = false;
  }
});
