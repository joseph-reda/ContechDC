import { spawn } from "node:child_process";

// SMB shares do not reliably emit filesystem watch events on Windows.
process.env.CHOKIDAR_USEPOLLING ??= "1";

const children = [
  spawn(process.execPath, ["backend/server.js"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 100).unref();
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
