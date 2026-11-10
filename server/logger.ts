import pino from "pino";

/** Journaux structurés JSON (stdout). Les secrets connus sont masqués. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: process.env.PILOTAGE_SERVICE ?? "web" },
  redact: {
    paths: ["*.token", "*.accessToken", "*.access_token", "*.refresh_token", "*.id_token", "*.secret", "*.password", "req.headers.cookie", "req.headers.authorization"],
    censor: "[masqué]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
