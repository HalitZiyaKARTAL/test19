<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });

  let seq = 0;

  async function renderMermaid(root = document) {
    for (const pre of root.querySelectorAll('pre[data-lang="mermaid"]')) {
      if (pre.dataset.mmdDone) continue;
      const codeEl = pre.querySelector('code');
      const src = (codeEl || pre).textContent;
      try {
        const { svg } = await mermaid.render('mmd_' + (++seq) + '_' + Date.now(), src);
        const wrap = document.createElement('div');
        wrap.className = 'mermaid-rendered';

        if (true) {                 // outer: apply bg?  false → nothing set → transparent (green shows)
          if (false) {              // inner: custom hex?  true → override below
            wrap.style.background = '#0a0a14';
          } else {
            wrap.style.background = getComputedStyle(pre).backgroundColor;   // live --code-bg (variable)
          }
        }

        wrap.innerHTML = svg;
        pre.parentElement.appendChild(wrap);
        pre.style.display = 'none';
        pre.dataset.mmdDone = '1';          // mark only after success (streaming-safe)
      } catch (e) {
        console.warn('mermaid render failed', e);   // leave source visible; retries next pass
      }
    }
  }

  let debounce = null;
  const scheduleRender = () => { clearTimeout(debounce); debounce = setTimeout(() => renderMermaid(document), 180); };

  const attach = () => {
    const target = document.getElementById('chatContainer') || document.body;
    new MutationObserver(scheduleRender).observe(target, { childList: true, subtree: true });
    renderMermaid(document);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
</script>

<style>
  .mermaid-rendered{ display:flex; justify-content:center; overflow:visible; padding:12px; border-radius:10px }
  .mermaid-rendered svg{ max-width:100%; height:auto; overflow:visible; background:transparent }
  .mermaid-rendered foreignObject{ overflow:visible }
  .mermaid-rendered foreignObject div,
  .mermaid-rendered foreignObject span{ line-height:1.18 !important; white-space:normal !important }
</style>
