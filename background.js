// Tab group data structure will be stored in browser.storage.local
// Format: { groups: { groupId: { name: string, tabs: [tabInfo] } } }

// Initialize storage with empty groups if not exists
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get("groups", (data) => {
    if (!data.groups) {
      browser.storage.local.set({ groups: {} });
    }
  });
});

// Save current tabs as a group
function saveTabGroup(groupName) {
  browser.tabs.query({ currentWindow: true }, (tabs) => {
    // Filter out pinned tabs
    const nonPinnedTabs = tabs.filter((tab) => !tab.pinned);

    const tabInfoList = nonPinnedTabs.map((tab) => ({
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
    }));

    browser.storage.local.get("groups", (data) => {
      const groups = data.groups || {};
      const groupId = Date.now().toString();

      groups[groupId] = {
        name: groupName,
        tabs: tabInfoList,
        created: Date.now(),
      };

      browser.storage.local.set({ groups });
    });
  });
}

// Open a tab group
function openTabGroup(groupId, openInNewWindow = false) {
  browser.storage.local.get("groups", (data) => {
    if (!data.groups || !data.groups[groupId]) {
      return;
    }

    const group = data.groups[groupId];

    if (openInNewWindow) {
      // Open in a new window
      browser.windows.create({ url: group.tabs[0].url }).then((newWindow) => {
        // Open the rest of the tabs in the new window
        for (let i = 1; i < group.tabs.length; i++) {
          browser.tabs.create({
            url: group.tabs[i].url,
            windowId: newWindow.id,
          });
        }
      });
    } else {
      // Open in current window and replace non-pinned tabs
      browser.tabs.query({ currentWindow: true }, (currentTabs) => {
        // Get non-pinned tabs to close later
        const nonPinnedTabs = currentTabs.filter((tab) => !tab.pinned);

        // Open the first tab of the group and get its window ID
        browser.tabs.create({ url: group.tabs[0].url }, (firstTab) => {
          const windowId = firstTab.windowId;

          // Open the rest of the tabs in the same window
          for (let i = 1; i < group.tabs.length; i++) {
            browser.tabs.create({
              url: group.tabs[i].url,
              windowId: windowId,
            });
          }

          // Close all the original non-pinned tabs
          const tabIdsToClose = nonPinnedTabs.map((tab) => tab.id);
          browser.tabs.remove(tabIdsToClose);
        });
      });
    }
  });
}

// Delete a tab group
function deleteTabGroup(groupId) {
  browser.storage.local.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      delete groups[groupId];
      browser.storage.local.set({ groups });
    }
  });
}

// Add current tab to an existing group
function addTabToGroup(groupId) {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;

    const tab = tabs[0];
    const tabInfo = {
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
    };

    browser.storage.local.get("groups", (data) => {
      if (data.groups && data.groups[groupId]) {
        const groups = data.groups;
        groups[groupId].tabs.push(tabInfo);
        browser.storage.local.set({ groups });
      }
    });
  });
}

// Remove a tab from a group
function removeTabFromGroup(groupId, tabIndex) {
  browser.storage.local.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].tabs.splice(tabIndex, 1);
      browser.storage.local.set({ groups });
    }
  });
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message, _, sendResponse) => {
  switch (message.action) {
    case "saveGroup":
      saveTabGroup(message.groupName);
      sendResponse({ success: true });
      break;
    case "openGroup":
      openTabGroup(message.groupId, message.openInNewWindow);
      sendResponse({ success: true });
      break;
    case "deleteGroup":
      deleteTabGroup(message.groupId);
      sendResponse({ success: true });
      break;
    case "addTabToGroup":
      addTabToGroup(message.groupId);
      sendResponse({ success: true });
      break;
    case "removeTabFromGroup":
      removeTabFromGroup(message.groupId, message.tabIndex);
      sendResponse({ success: true });
      break;
    case "getGroups":
      browser.storage.local.get("groups", (data) => {
        sendResponse({ groups: data.groups || {} });
      });
      return true; // Keep the message channel open for the async response
  }
});
