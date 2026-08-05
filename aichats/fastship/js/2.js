// 1. Inject the Marked.js library and Table CSS
if (!window.marked) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    script.onload = applyMarked;
    document.head.appendChild(script);
    
    const style = document.createElement('style');
    style.innerHTML = `
        .bubble table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.85rem; overflow-x: auto; display: block; }
        .bubble th, .bubble td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
        .bubble th { background: rgba(0,0,0,0.3); font-weight: bold; color: var(--accent); }
        .bubble tbody tr:nth-child(even) { background: rgba(0,0,0,0.15); }
    `;
    document.head.appendChild(style);
} else {
    applyMarked();
}

// 2. Override the simplistic parser with Marked.js
function applyMarked() {
    formatMarkdown = function(rawText) {
        if (!rawText) return '';
        const renderer = new marked.Renderer();
        
        // Hijack Marked's code rendering so we keep the custom Copy Buttons!
        renderer.code = function(code) {
            const text = typeof code === 'object' ? code.text : arguments[0];
            const lang = typeof code === 'object' ? code.lang : arguments[1];
            const collapsed = settings.blockAutoCollapse && text.length > settings.blockCollapseSize;
            return buildCodeBlockHTML(lang || 'plain', text + '\n', collapsed);
        };
        
        return marked.parse(rawText, { renderer: renderer, breaks: true, gfm: true });
    };
    
    // Force the chat to refresh so the tables appear immediately
    renderFullChat();
}

"Marked.js injected! Tables are rendering properly.";
