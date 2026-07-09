(function() {
    if (typeof currentParsedSnippets === 'undefined' || currentParsedSnippets.length === 0) {
        showToast("No diffs loaded!", "warning");
        return;
    }
    
    // Create a temporary string to simulate sequential injection
    let simulatedTarget = els.target.value;
    
    let fails = [];
    let skips = [];
    let successes = 0;
    
    currentParsedSnippets.forEach((patch, i) => {
        const anchor = patch.replace(/\/\*🟢\*\/([\s\S]*?)\/\*🟡([\s\S]*?)🔴\*\//g, "$2");
        const count = simulatedTarget.split(anchor).length - 1;
        
        if (count === 1) {
            // ACTUALLY SIMULATE THE INJECTION IN RAM
            simulatedTarget = simulatedTarget.replace(anchor, patch);
            successes++;
        } else if (count === 0) {
            if (simulatedTarget.includes(patch)) {
                skips.push(`Diff ${i + 1}: SKIPPED (Duplicate/Already in memory)`);
            } else {
                let preview = anchor.substring(0, 60).replace(/</g, '&lt;');
                fails.push(`Diff ${i + 1}: NOT FOUND\nAnchor: ${preview}...`);
            }
        } else {
            fails.push(`Diff ${i + 1}: FAILED (${count} matches found)`);
        }
    });
    
    // Remove old modal
    let oldModal = document.getElementById("mobileV8Report");
    if (oldModal) oldModal.remove();
    
    // Create full-screen mobile popup
    let modal = document.createElement("div");
    modal.id = "mobileV8Report";
    modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100dvh; background:rgba(13, 17, 23, 0.95); z-index:99999; display:flex; flex-direction:column; padding:20px; box-sizing:border-box; overflow-y:auto; font-family:system-ui, sans-serif; backdrop-filter:blur(5px);";
    
    let html = `<h2 style="margin-top:10px; color:#58a6ff; border-bottom:1px solid #30363d; padding-bottom:10px;">True Sequential Diagnostic</h2>`;
    html += `<p style="font-size:1.2em; font-weight:bold; color:#c9d1d9;">✅ ${successes} Ready | ⏭️ ${skips.length} Skipped | ❌ ${fails.length} Failed</p>`;
    
    if (fails.length) {
        html += `<h3 style="color:#f85149; margin:15px 0 5px;">❌ Fails:</h3>`;
        html += `<div style="background:#21262d; border:1px solid #8b1818; padding:12px; border-radius:8px; font-size:13px; color:#ffa198; white-space:pre-wrap; word-break:break-all;">${fails.join('\n\n')}</div>`;
    }
    
    if (skips.length) {
        html += `<h3 style="color:#d29922; margin:15px 0 5px;">⏭️ Skips:</h3>`;
        html += `<div style="background:#21262d; border:1px solid #d29922; padding:12px; border-radius:8px; font-size:13px; color:#e3b341; white-space:pre-wrap; word-break:break-word;">${skips.join('\n\n')}</div>`;
    }
    
    html += `<div style="flex:1;"></div>`;
    html += `<button style="margin-top:20px; margin-bottom:20px; padding:16px; background:#58a6ff; color:#000; border:none; border-radius:8px; font-size:18px; font-weight:bold; width:100%; cursor:pointer;" onclick="this.parentElement.remove()">CLOSE</button>`;
    
    modal.innerHTML = html;
    document.body.appendChild(modal);
})();
