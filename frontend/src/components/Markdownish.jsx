// Tiny renderer for LLM output: bullets, numbered lists, **bold**, and clickable [mm:ss] stamps.
// Avoids pulling in a markdown library for a handful of patterns.
function parseStamp(s) {
  const parts = s.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function Inline({ text, onSeek }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\])/g);
  return tokens.map((t, i) => {
    if (t.startsWith("**") && t.endsWith("**")) return <strong key={i}>{t.slice(2, -2)}</strong>;
    const m = t.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) {
      return onSeek ? (
        <button key={i} onClick={() => onSeek(parseStamp(m[1]))} className="font-mono text-xs text-indigo-600 hover:underline">
          {t}
        </button>
      ) : (
        <span key={i} className="font-mono text-xs text-indigo-600">
          {t}
        </span>
      );
    }
    return t;
  });
}

export default function Markdownish({ text, onSeek }) {
  const blocks = [];
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) {
        list = { ordered, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet[1]);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(h ? { heading: h[1] } : { p: line });
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {blocks.map((b, i) => {
        if (b.items) {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inline text={it} onSeek={onSeek} />
                </li>
              ))}
            </Tag>
          );
        }
        if (b.heading) return <p key={i} className="font-semibold"><Inline text={b.heading} onSeek={onSeek} /></p>;
        return <p key={i}><Inline text={b.p} onSeek={onSeek} /></p>;
      })}
    </div>
  );
}
