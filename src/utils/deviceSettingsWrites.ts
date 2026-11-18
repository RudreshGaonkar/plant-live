// Serialize writes for a controller because location presets overlap the individual threshold fields.
export function createDeviceSettingsQueue() {
  const queues = new Map<string, Promise<unknown>>();
  const lockedFields = new Set<string>();

  return function enqueue(
    scope: string,
    field: string,
    write: () => Promise<unknown>,
  ): Promise<unknown> | undefined {
    const key = JSON.stringify([scope, field]);
    if (lockedFields.has(key)) return;
    lockedFields.add(key);
    const pending = (queues.get(scope) ?? Promise.resolve())
      .catch(() => {})
      .then(write)
      .finally(() => {
        lockedFields.delete(key);
        if (queues.get(scope) === pending) queues.delete(scope);
      });
    queues.set(scope, pending);
    return pending;
  };
}
