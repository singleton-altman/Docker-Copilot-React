import { useEffect, useSyncExternalStore } from 'react'

export function useComposeJobs(controller) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => {
    controller.start({ document, window })
    return () => controller.stop()
  }, [controller])
  return { ...state, controller }
}
