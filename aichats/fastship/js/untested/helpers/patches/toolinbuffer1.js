/* tool-call pre-save: writes pending tool call to stream buffer BEFORE execution (≤100ms, errors ignored) */
(() => {
  var SAVE_MS = 100;
  function preSave(name, args) {
    try {
      var mid = window.__dseCurrentMsg, n = mid && chatTree.nodes[mid];
      if (!n) return Promise.resolve();
      var vi = n.activeVersion || 0, v = n.versions && n.versions[vi];
      if (!v || v.endTime) return Promise.resolve();
      var raw = v.rawContent || '';
      if (raw.indexOf('// Executing: ' + name) >= 0) return Promise.resolve();
      var echo = '\n\n```javascript\n// Executing: ' + name + '\n' + (args ? JSON.stringify(args) : '') + '\n```\n';
      v.rawContent = raw + echo;
      var p = saveStreamBuffer(n, vi);   // snapshot taken synchronously → bypasses the 500ms throttle
      v.rawContent = raw;                // restore → no UI double-echo
      return Promise.race([ Promise.resolve(p).catch(function(){}), new Promise(function(r){ setTimeout(r, SAVE_MS); }) ]);
    } catch (e) { return Promise.resolve(); }
  }
  function apply() {
    var added = 0;
    Object.keys(window.__tools || {}).forEach(function (name) {
      var t = window.__tools[name];
      if (!t || typeof t.run !== 'function' || t.run.__callSavePatched) return;
      var orig = t.run;
      var w = function (args, signal) {
        return preSave(name, args)
          .then(function () { return orig.apply(this, arguments); }.bind(this))
          .catch(function () { return orig.apply(this, arguments); }.bind(this));
      };
      w.__callSavePatched = 1; w.__orig = orig; t.run = w; added++;
    });
    return added;
  }
  function undo() {
    var removed = 0;
    Object.keys(window.__tools || {}).forEach(function (name) {
      var t = window.__tools[name];
      if (t && t.run && t.run.__callSavePatched && t.run.__orig) { t.run = t.run.__orig; removed++; }
    });
    return removed;
  }
  var list = () => Object.keys(window.__tools || {}).filter(k => window.__tools[k].run && window.__tools[k].run.__callSavePatched);
  var MOD = window.__toolCallPreSave = { apply, undo, list, SAVE_MS };
  MOD.apply();                                   // auto-applies on paste
  console.log('[preSave] tools patched: ' + MOD.list().length);
  return '[preSave] applied · patched=' + MOD.list().length;
})();
