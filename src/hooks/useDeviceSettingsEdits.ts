import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/store/useSession';
import { createDeviceSettingsQueue } from '@/utils/deviceSettingsWrites';

type FieldStatus =
  | { state: 'pending' }
  | { state: 'saved' }
  | { state: 'error'; error: string; retry: () => void };

const enqueue = createDeviceSettingsQueue();

export function useDeviceSettingsEdits(uid: string, deviceId: string) {
  const scope = JSON.stringify([uid, deviceId]);
  const keyFor = (field: string) => JSON.stringify([scope, field]);
  const [drafts, setDrafts] = useState<Record<string, number | undefined>>({});
  const [statuses, setStatuses] = useState<Record<string, FieldStatus | undefined>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const activeTimers = timers.current;
    return () => {
      mounted.current = false;
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);

  function setDraft(field: string, value?: number) {
    setDrafts((previous) => ({ ...previous, [keyFor(field)]: value }));
  }

  async function save(field: string, write: (targetId: string) => Promise<unknown>) {
    if (!uid || !deviceId || useSession.getState().user?.uid !== uid) return;
    const key = keyFor(field);
    const pending = enqueue(scope, field, () => {
      if (useSession.getState().user?.uid !== uid) throw new Error('The account changed before saving.');
      return write(deviceId);
    });
    if (!pending) return;

    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setStatuses((previous) => ({ ...previous, [key]: { state: 'pending' } }));
    try {
      await pending;
      if (!mounted.current || useSession.getState().user?.uid !== uid) return;
      setDraft(field);
      setStatuses((previous) => ({ ...previous, [key]: { state: 'saved' } }));
      const timer = setTimeout(() => {
        if (timers.current.get(key) !== timer) return;
        timers.current.delete(key);
        setStatuses((previous) => ({ ...previous, [key]: undefined }));
      }, 2500);
      timers.current.set(key, timer);
    } catch (error) {
      if (!mounted.current || useSession.getState().user?.uid !== uid) return;
      const message = error instanceof Error ? error.message : 'Save failed.';
      setStatuses((previous) => ({
        ...previous,
        [key]: { state: 'error', error: message, retry: () => void save(field, write) },
      }));
    }
  }

  return {
    scope,
    draft: (field: string) => drafts[keyFor(field)],
    status: (field: string) => statuses[keyFor(field)],
    setDraft,
    save,
  };
}
