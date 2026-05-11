export function createSearchController({
  resolver,
  onResolved,
  onHint,
  onResolvedRewrite,
  debounceMs = 300,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let timer = null;
  let seq = 0;

  function submit(rawInput) {
    if (timer != null) clearTimeoutFn(timer);
    const mySeq = ++seq;
    const text = String(rawInput ?? "").trim();

    timer = setTimeoutFn(async () => {
      if (mySeq !== seq) return;
      if (!text) {
        onHint?.(null);
        return;
      }

      let resolved;
      try {
        resolved = await resolver(text);
      } catch {
        resolved = null;
      }

      if (mySeq !== seq) return;
      if (!resolved) {
        onHint?.(`找不到「${text}」對應的股票，請確認代號或名稱`);
        return;
      }

      onHint?.(null);
      onResolvedRewrite?.(resolved);
      onResolved?.(resolved);
    }, debounceMs);
  }

  function cancel() {
    if (timer != null) clearTimeoutFn(timer);
    timer = null;
    seq += 1;
  }

  return { submit, cancel };
}
