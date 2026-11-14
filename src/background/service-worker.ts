// Message routing and side panel enablement.

const AMAZON_IN = /^https:\/\/www\.amazon\.in\//;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Enable the side panel only on amazon.in tabs.
chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  const enabled = tab.url !== undefined && AMAZON_IN.test(tab.url);
  void chrome.sidePanel.setOptions({ tabId, path: 'src/sidepanel/index.html', enabled });
});
