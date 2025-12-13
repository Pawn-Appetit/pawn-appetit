import { memo, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { events } from "@/bindings";
import { TreeStateContext } from "@/components/TreeStateContext";

type Props = {
  id: string;
};

function ReportProgressSubscriber({ id }: Props) {
  const store = useContext(TreeStateContext)!;
  const setCompleted = useStore(store, (s) => s.setReportCompleted);
  const setInProgress = useStore(store, (s) => s.setReportInProgress);
  const setProgress = useStore(store, (s) => s.setReportProgress);
  const lastRef = useRef<{ t: number; p: number }>({ t: 0, p: -1 });

  useEffect(() => {
    const unlisten = events.reportProgress.listen(async ({ payload }) => {
      if (payload.id !== id) return;
      if (payload.finished) {
        setInProgress(false);
        setCompleted(true);
        setProgress(0);
      } else {
        // Throttle progress updates to reduce render churn during analysis
        const now = Date.now();
        const last = lastRef.current;
        if (payload.progress === last.p && now - last.t < 250) return;
        if (now - last.t < 100 && payload.progress < 0.99) return;
        lastRef.current = { t: now, p: payload.progress };
        setProgress(payload.progress);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [id, setCompleted, setInProgress, setProgress]);

  return <></>;
}

export default memo(ReportProgressSubscriber);
