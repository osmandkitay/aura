import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end"
}

// Check for AURA v1.3 manifest at standard location
async function checkAuraSupport() {
  const manifestUrl = `${window.location.origin}/.well-known/aura.json`;
  
  try {
    const response = await fetch(manifestUrl, { method: 'HEAD' });
    if (response.ok) {
      console.log(`AURA v1.3 manifest found at: ${manifestUrl}`);
      chrome.storage.local.set({ 
        auraStatus: { 
          supported: true, 
          url: manifestUrl,
          version: '1.3'
        } 
      });
      return;
    }
  } catch (error) {
    // Silently fail - site might not support AURA
  }
  
  // Fallback: Check for legacy link tag
  const linkTag = document.querySelector<HTMLLinkElement>('link[rel="aura"]');
  if (linkTag && linkTag.href) {
    console.log(`Legacy AURA manifest found at: ${linkTag.href}`);
    chrome.storage.local.set({ 
      auraStatus: { 
        supported: true, 
        url: linkTag.href,
        version: '1.0'
      } 
    });
  } else {
    chrome.storage.local.set({ auraStatus: { supported: false } });
  }
}

checkAuraSupport(); 