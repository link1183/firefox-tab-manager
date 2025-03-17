// Tab group data structure will be stored in browser.storage.sync for cross-device functionality
// Format: { groups: { groupId: { name: string, tabs: [tabInfo], created: timestamp } } }

// Initialize storage with empty groups if not exists
browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.get("groups").then((data) => {
    if (!data.groups) {
      browser.storage.sync.set({ groups: {} });
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
      domain: extractDomain(tab.url),
    }));

    browser.storage.sync.get("groups").then((data) => {
      const groups = data.groups || {};
      const groupId = Date.now().toString();

      groups[groupId] = {
        name: groupName,
        tabs: tabInfoList,
        created: Date.now(),
      };

      browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
      });
    });
  });
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return "";
  }
}

// Open a tab group
function openTabGroup(groupId, openInNewWindow = false) {
  browser.storage.sync.get("groups").then((data) => {
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
      browser.tabs.query({ currentWindow: true }).then((currentTabs) => {
        // Get non-pinned tabs to close later
        const nonPinnedTabs = currentTabs.filter((tab) => !tab.pinned);

        // Open the first tab of the group and get its window ID
        browser.tabs.create({ url: group.tabs[0].url }).then((firstTab) => {
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

    // Update last accessed timestamp
    updateGroupAccessTime(groupId);
  });
}

// Update the last accessed timestamp for a group
function updateGroupAccessTime(groupId) {
  browser.storage.sync.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].lastAccessed = Date.now();
      browser.storage.sync.set({ groups });
    }
  });
}

// Delete a tab group
function deleteTabGroup(groupId) {
  browser.storage.sync.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      delete groups[groupId];
      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
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
      domain: extractDomain(tab.url),
    };

    browser.storage.sync.get("groups", (data) => {
      if (data.groups && data.groups[groupId]) {
        const groups = data.groups;
        groups[groupId].tabs.push(tabInfo);
        browser.storage.sync.set({ groups }, () => {
          notifyGroupsUpdated();
        });
      }
    });
  });
}

// Remove a tab from a group
function removeTabFromGroup(groupId, tabIndex) {
  browser.storage.sync.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].tabs.splice(tabIndex, 1);
      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    }
  });
}

// Reorder tabs within a group
function reorderTabInGroup(groupId, oldIndex, newIndex) {
  browser.storage.sync.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      const tab = groups[groupId].tabs[oldIndex];

      // Remove from old position
      groups[groupId].tabs.splice(oldIndex, 1);

      // Insert at new position
      groups[groupId].tabs.splice(newIndex, 0, tab);

      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    }
  });
}

// Move a tab from one group to another
function moveTabBetweenGroups(sourceGroupId, tabIndex, targetGroupId) {
  browser.storage.sync.get("groups", (data) => {
    if (
      data.groups &&
      data.groups[sourceGroupId] &&
      data.groups[targetGroupId]
    ) {
      const groups = data.groups;
      const tab = groups[sourceGroupId].tabs[tabIndex];

      // Remove from source group
      groups[sourceGroupId].tabs.splice(tabIndex, 1);

      // Add to target group
      groups[targetGroupId].tabs.push(tab);

      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    }
  });
}

// Auto-group tabs by domain
function autoGroupTabs() {
  browser.tabs.query({ currentWindow: true }, (tabs) => {
    // Filter out pinned tabs
    const nonPinnedTabs = tabs.filter((tab) => !tab.pinned);

    // Group tabs by domain
    const domainGroups = {};

    nonPinnedTabs.forEach((tab) => {
      const domain = extractDomain(tab.url);
      if (!domain) return;

      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }

      domainGroups[domain].push({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        domain: domain,
      });
    });

    // Create a new group for each domain with more than one tab
    browser.storage.sync.get("groups", (data) => {
      const groups = data.groups || {};

      Object.keys(domainGroups).forEach((domain) => {
        if (domainGroups[domain].length > 1) {
          const groupId = `auto_${domain}_${Date.now()}`;
          groups[groupId] = {
            name: `${domain.replace("www.", "")}`,
            tabs: domainGroups[domain],
            created: Date.now(),
            auto: true,
          };
        }
      });

      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    });
  });
}

// Export tab groups to JSON
function exportGroups() {
  return new Promise((resolve) => {
    browser.storage.sync.get("groups", (data) => {
      const groups = data.groups || {};
      const exportData = JSON.stringify(groups, null, 2);
      resolve(exportData);
    });
  });
}

// Import tab groups from JSON
function importGroups(jsonData) {
  try {
    const importedGroups = JSON.parse(jsonData);

    browser.storage.sync.get("groups", (data) => {
      const currentGroups = data.groups || {};

      // Merge imported groups with current groups
      const mergedGroups = { ...currentGroups, ...importedGroups };

      browser.storage.sync.set({ groups: mergedGroups }, () => {
        notifyGroupsUpdated();
        return true;
      });
    });

    return true;
  } catch (e) {
    console.error("Import failed:", e);
    return false;
  }
}

// Notify that groups have been updated
function notifyGroupsUpdated() {
  browser.runtime.sendMessage({ action: "groupsUpdated" });
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
    case "reorderTabInGroup":
      reorderTabInGroup(message.groupId, message.oldIndex, message.newIndex);
      sendResponse({ success: true });
      break;
    case "moveTabBetweenGroups":
      moveTabBetweenGroups(
        message.sourceGroupId,
        message.tabIndex,
        message.targetGroupId,
      );
      sendResponse({ success: true });
      break;
    case "autoGroupTabs":
      autoGroupTabs();
      sendResponse({ success: true });
      break;
    case "exportGroups":
      exportGroups().then((data) => {
        sendResponse({ success: true, data });
      });
      return true; // Keep the message channel open for the async response
    case "importGroups":
      const result = importGroups(message.data);
      sendResponse({ success: result });
      break;
    case "getGroups":
      browser.storage.sync.get("groups").then((data) => {
        sendResponse({ groups: data.groups || {} });
      });
      return true; // Keep the message channel open for the async response
  }
});
