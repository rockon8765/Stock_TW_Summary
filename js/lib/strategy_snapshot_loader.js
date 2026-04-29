function argsMatch(leftArgs, rightArgs) {
  if (leftArgs.length !== rightArgs.length) return false;
  return leftArgs.every((arg, index) => arg === rightArgs[index]);
}

export function createRetryableSnapshotLoader(fetcher) {
  let cachedSnapshot = null;
  let pendingLoad = null;

  return {
    async load(...args) {
      if (cachedSnapshot !== null) return cachedSnapshot;
      if (pendingLoad && argsMatch(pendingLoad.args, args)) {
        return pendingLoad.promise;
      }

      const entry = {
        args,
        promise: Promise.resolve(fetcher(...args))
        .then((result) => {
          if (result != null) cachedSnapshot = result;
          return result ?? null;
        })
        .finally(() => {
          if (pendingLoad === entry) pendingLoad = null;
        }),
      };

      pendingLoad = entry;
      return entry.promise;
    },

    getCached() {
      return cachedSnapshot;
    },

    reset() {
      cachedSnapshot = null;
      pendingLoad = null;
    },
  };
}
