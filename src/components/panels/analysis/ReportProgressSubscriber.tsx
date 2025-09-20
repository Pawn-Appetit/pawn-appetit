import { memo, useContext, useEffect } from "react";
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

  useEffect(() => {
    const unlisten = events.reportProgress.listen(async ({ payload }) => {
      if (payload.id !== id) return;
      if (payload.finished) {
        setInProgress(false);
        setCompleted(true);
        setProgress(0);
      } else {
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
