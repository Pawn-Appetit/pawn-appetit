/** biome-ignore-all lint/suspicious/noExplicitAny: For logging formatting */
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

function formatMessage(msg: any, ...optionalParams: any[]) {
    return [msg, ...optionalParams]
        .map((p) => {
            if (typeof p === "object") {
                return JSON.stringify(p);
            }
            return String(p);
        })
        .join(" ");
}

export const logger = {
    info: (msg: any, ...rest: any[]) => info(formatMessage(msg, ...rest)),
    error: (msg: any, ...rest: any[]) => error(formatMessage(msg, ...rest)),
    warn: (msg: any, ...rest: any[]) => warn(formatMessage(msg, ...rest)),
    debug: (msg: any, ...rest: any[]) => debug(formatMessage(msg, ...rest)),
    trace: (msg: any, ...rest: any[]) => trace(formatMessage(msg, ...rest)),
};
