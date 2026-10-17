const sendBtn = document.getElementById("send-btn");
const statusEl = document.getElementById("status");

function showStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

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
      showStatus(`✅ Sent!\nTx: ${data.txHash}\nBlock: ${data.blockNumber}`, "success");
    }
  } catch (err) {
    showStatus("Request failed: " + err.message, "error");
  } finally {
    sendBtn.disabled = false;
  }
});