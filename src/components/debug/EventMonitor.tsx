import { useEffect } from "react";
import { events } from "@/bindings";

export function EventMonitor() {
  useEffect(() => {
    console.log("🔍 EventMonitor: Setting up global event listeners");

    const bestMovesUnlisten = events.bestMovesPayload.listen((event) => {
      console.log("🔍 GLOBAL EVENT MONITOR: bestMovesPayload received", {
        timestamp: new Date().toISOString(),
        engine: event.payload.engine,
        tab: event.payload.tab,
        progress: event.payload.progress,
        bestLinesCount: event.payload.bestLines.length,
        fen: event.payload.fen?.substring(0, 50) + "...",
        moves: event.payload.moves,
      });
    });

    const progressUnlisten = events.reportProgress.listen((event) => {
      console.log("🔍 GLOBAL EVENT MONITOR: reportProgress received", {
        timestamp: new Date().toISOString(),
        id: event.payload.id,
        progress: event.payload.progress,
        finished: event.payload.finished,
      });
    });

    const dbProgressUnlisten = events.databaseProgress.listen((event) => {
      console.log("🔍 GLOBAL EVENT MONITOR: databaseProgress received", {
        timestamp: new Date().toISOString(),
        id: event.payload.id,
        progress: event.payload.progress,
      });
    });

    const downloadProgressUnlisten = events.downloadProgress.listen((event) => {
      console.log("🔍 GLOBAL EVENT MONITOR: downloadProgress received", {
        timestamp: new Date().toISOString(),
        id: event.payload.id,
        progress: event.payload.progress,
        finished: event.payload.finished,
      });
    });

    return () => {
      console.log("🔍 EventMonitor: Cleaning up event listeners");
      bestMovesUnlisten.then((f) => f());
      progressUnlisten.then((f) => f());
      dbProgressUnlisten.then((f) => f());
      downloadProgressUnlisten.then((f) => f());
    };
  }, []);

  return null;
};