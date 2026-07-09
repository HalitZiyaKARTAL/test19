(function() {
    if (typeof currentParsedSnippets === 'undefined' || currentParsedSnippets.length === 0) {
        alert("No parsed snippets found! Make sure the diffs are in the left panel.");
        return;
    }
    
    let target = els.target.value;
    let fails = [];
    
    currentParsedSnippets.forEach((patch, i) => {
        // Extract the exact old text it is searching for
        let anchor = patch.replace(/\/\*🟢\*\/([\s\S]*?)\/\*🟡([\s\S]*?)🔴\*\//g, "$2");
        let count = target.split(anchor).length - 1;
        
        if (count === 0 && !target.includes(patch)) {
            fails.push("Diff " + (i + 1) + ": Anchor NOT FOUND in target code.\nSearched for:\n" + anchor.substring(0, 80) + "...");
        } else if (count > 1) {
            fails.push("Diff " + (i + 1) + ": MULTIPLE MATCHES (" + count + "). The anchor isn't unique enough.");
        }
    });
    
    if (fails.length === 0) {
        alert("No failures detected! All snippets are either ready to apply or already applied.");
    } else {
        // Log to console so you can copy it easily, and show an alert
        console.log("--- FAILED DIFF REPORT ---");
        console.log(fails.join("\n\n"));
        alert(fails.length + " diffs failed. Check the browser console (F12) for the full text to paste back to me, or read here:\n\n" + fails.join("\n\n"));
    }
})();
