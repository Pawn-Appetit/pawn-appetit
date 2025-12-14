import { Progress } from "@mantine/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

type ProgressPayload = {
  id: string;
  progress: number;
  finished: boolean;
};

function DatabaseLoader({ isLoading, tab }: { isLoading: boolean; tab: string | null }) {
  const [progress, setProgress] = useState(0);
  const [_completed, setCompleted] = useState(false);

  useEffect(() => {
    // Reset progress when tab changes
    setProgress(0);
    setCompleted(false);
    
    if (!tab) return;
    
    let unlistenFn: (() => void) | null = null;
    
    async function getProgress() {
      const unlisten = await listen<ProgressPayload>("search_progress", async ({ payload }) => {
        if (payload.id !== tab) return;
        if (payload.finished) {
          setCompleted(true);
          setProgress(0);
          if (unlistenFn) {
            unlistenFn();
            unlistenFn = null;
          }
        } else {
          setProgress(payload.progress);
        }
      });
      
      unlistenFn = unlisten;
    }
    
    getProgress();
    
    // Cleanup on unmount or tab change
    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [tab]);

  const isLoadingFromMemory = isLoading && progress === 0;

  return <Progress animated={isLoadingFromMemory} value={isLoadingFromMemory ? 100 : progress} size="xs" mt="xs" />;
}

export default DatabaseLoader;
