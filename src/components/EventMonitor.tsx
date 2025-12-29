import { useEffect } from "react";
import { IS_DEV } from "@/config";
import { events } from "@/bindings";
import { logger } from "@/utils/logger";

type Unlisten = () => void;

export function EventMonitor() {
  useEffect(() => {
    if (!IS_DEV) return;

    let active = true;
    let bestMovesUnlisten: Unlisten | null = null;
    let reportProgressUnlisten: Unlisten | null = null;
    let databaseProgressUnlisten: Unlisten | null = null;
    let downloadProgressUnlisten: Unlisten | null = null;

    events.bestMovesPayload
      .listen(({ payload }) => {
        logger.debug("EventMonitor bestMovesPayload", {
          engine: payload.engine,
          tab: payload.tab,
          progress: payload.progress,
          bestLinesCount: payload.bestLines.length,
          fenPrefix: payload.fen ? `${payload.fen.slice(0, 50)}...` : "",
          moves: payload.moves,
        });
      })
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        bestMovesUnlisten = unlisten;
      })
      .catch((error) => {
        logger.warn("EventMonitor bestMovesPayload listener failed", error);
      });

    events.reportProgress
      .listen(({ payload }) => {
        logger.debug("EventMonitor reportProgress", {
          id: payload.id,
          progress: payload.progress,
          finished: payload.finished,
        });
      })
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        reportProgressUnlisten = unlisten;
      })
      .catch((error) => {
        logger.warn("EventMonitor reportProgress listener failed", error);
      });

    events.databaseProgress
      .listen(({ payload }) => {
        logger.debug("EventMonitor databaseProgress", {
          id: payload.id,
          progress: payload.progress,
        });
      })
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        databaseProgressUnlisten = unlisten;
      })
      .catch((error) => {
        logger.warn("EventMonitor databaseProgress listener failed", error);
      });

    events.downloadProgress
      .listen(({ payload }) => {
        logger.debug("EventMonitor downloadProgress", {
          id: payload.id,
          progress: payload.progress,
          finished: payload.finished,
        });
      })
      .then((unlisten) => {
        if (!active) {
          unlisten();
          return;
        }
        downloadProgressUnlisten = unlisten;
      })
      .catch((error) => {
        logger.warn("EventMonitor downloadProgress listener failed", error);
      });

    return () => {
      active = false;
      bestMovesUnlisten?.();
      reportProgressUnlisten?.();
      databaseProgressUnlisten?.();
      downloadProgressUnlisten?.();
    };
  }, []);

  return null;
}
