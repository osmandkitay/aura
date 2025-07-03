import { useEffect, useState } from "react"

function IndexPopup() {
  const [auraStatus, setAuraStatus] = useState({ supported: false, url: '' });

  useEffect(() => {
    chrome.storage.local.get("auraStatus", (result) => {
      if (result.auraStatus) {
        setAuraStatus(result.auraStatus);
      }
    });
  }, []);

  return (
    <div style={{ padding: '16px', width: '250px' }}>
      <h2>AURA Adapter</h2>
      {auraStatus.supported ? (
        <div style={{ color: 'green' }}>
          <p><strong>Status:</strong> AURA Detected!</p>
          <p style={{ fontSize: '12px', wordWrap: 'break-word' }}>
            Manifest URL: {auraStatus.url}
          </p>
        </div>
      ) : (
        <p style={{ color: 'red' }}><strong>Status:</strong> No AURA support on this page.</p>
      )}
    </div>
  )
}

export default IndexPopup
