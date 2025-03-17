document.addEventListener("DOMContentLoaded", function () {
  // Get elements
  const promptMessage = document.getElementById("promptMessage");
  const promptInput = document.getElementById("promptInput");
  const confirmButton = document.getElementById("confirmButton");
  const cancelButton = document.getElementById("cancelButton");

  // Get prompt data that was stored by the background script
  browser.storage.local.get("promptData").then((data) => {
    if (data.promptData) {
      // Set message and default value
      promptMessage.textContent = data.promptData.message || "Enter value:";
      promptInput.value = data.promptData.defaultValue || "";

      // Select the text for easy editing
      promptInput.select();
    }
  });

  // Handle confirm button click
  confirmButton.addEventListener("click", function () {
    // Send response back to background script
    browser.runtime
      .sendMessage({
        action: "promptResponse",
        value: promptInput.value,
      })
      .then(() => {
        window.close();
      });
  });

  // Handle cancel button click
  cancelButton.addEventListener("click", function () {
    // Send null response to indicate cancellation
    browser.runtime
      .sendMessage({
        action: "promptResponse",
        value: null,
      })
      .then(() => {
        window.close();
      });
  });

  // Handle enter key for confirmation
  promptInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      confirmButton.click();
    } else if (event.key === "Escape") {
      cancelButton.click();
    }
  });
});
