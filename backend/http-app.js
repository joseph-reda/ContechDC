import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function compileRoute(routePath) {
  const names = [];
  const escaped = routePath.split("/").map((part) => {
    if (part.startsWith(":")) {
      names.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return { regex: new RegExp(`^${escaped}/?$`), names };
}

function prepareRequest(req) {
  const parsed = new URL(req.url, "http://localhost");
  req.path = decodeURIComponent(parsed.pathname);
  req.query = Object.fromEntries(parsed.searchParams.entries());
  req.params = {};
  req.get = (name) => req.headers[String(name).toLowerCase()];
}

function prepareResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (headers) => { for (const [key, value] of Object.entries(headers)) res.setHeader(key, value); return res; };
  res.json = (value) => {
    if (res.writableEnded) return res;
    const data = Buffer.from(JSON.stringify(value));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Length", data.length);
    res.end(data);
    return res;
  };
  res.send = (value) => {
    if (res.writableEnded) return res;
    const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Length", data.length);
    res.end(data);
    return res;
  };
  res.cookie = (name, value, options = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.secure) parts.push("Secure");
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    const previous = res.getHeader("Set-Cookie");
    res.setHeader("Set-Cookie", previous ? [...(Array.isArray(previous) ? previous : [previous]), parts.join("; ")] : parts.join("; "));
    return res;
  };
  res.clearCookie = (name, options = {}) => res.cookie(name, "", { ...options, expires: new Date(0) });
  res.sendFile = (filename) => {
    try {
      const data = fs.readFileSync(filename);
      res.setHeader("Content-Type", mimeTypes[path.extname(filename).toLowerCase()] || "application/octet-stream");
      return res.send(data);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
  };
}

function createRouter() {
  const layers = [];
  const router = {
    disable() { return router; },
    use(first, second) {
      const routePath = typeof first === "string" ? first : "/";
      const handler = typeof first === "string" ? second : first;
      if (handler?.handle) {
        layers.push({ type: "router", path: routePath.replace(/\/$/, ""), handler });
      } else {
        layers.push({ type: "middleware", path: routePath.replace(/\/$/, "") || "/", handler, isError: handler.length === 4 });
      }
      return router;
    },
    get(routePath, ...handlers) { addRoute("GET", routePath, handlers); return router; },
    post(routePath, ...handlers) { addRoute("POST", routePath, handlers); return router; },
    put(routePath, ...handlers) { addRoute("PUT", routePath, handlers); return router; },
    delete(routePath, ...handlers) { addRoute("DELETE", routePath, handlers); return router; },
    listen(port, host, callback) {
      const server = http.createServer((req, res) => {
        prepareRequest(req);
        prepareResponse(res);
        router.handle(req, res, (error) => {
          if (res.writableEnded) return;
          if (error) res.status(500).json({ error: error.message || "Internal server error" });
          else res.status(404).json({ error: "Route not found" });
        });
      });
      return server.listen(port, host, callback);
    },
    handle(req, res, done) {
      let index = 0;
      const dispatch = (error) => {
        if (res.writableEnded) return;
        const layer = layers[index++];
        if (!layer) return done(error);
        const requestPath = req.path || "/";

        if (layer.type === "route") {
          if (error || req.method !== layer.method) return dispatch(error);
          const match = layer.regex.exec(requestPath);
          if (!match) return dispatch();
          req.params = Object.fromEntries(layer.names.map((name, position) => [name, decodeURIComponent(match[position + 1])]));
          return runHandlers(layer.handlers, req, res, dispatch);
        }

        const pathMatches = layer.path === "/" || requestPath === layer.path || requestPath.startsWith(`${layer.path}/`);
        if (!pathMatches) return dispatch(error);

        if (layer.type === "router") {
          if (error) return dispatch(error);
          const originalPath = req.path;
          req.path = requestPath.slice(layer.path.length) || "/";
          return layer.handler.handle(req, res, (nestedError) => {
            req.path = originalPath;
            dispatch(nestedError);
          });
        }

        if (error && !layer.isError) return dispatch(error);
        if (!error && layer.isError) return dispatch();
        try {
          const result = layer.isError
            ? layer.handler(error, req, res, dispatch)
            : layer.handler(req, res, dispatch);
          if (result?.catch) result.catch(dispatch);
        } catch (caught) {
          dispatch(caught);
        }
      };
      dispatch();
    },
  };

  function addRoute(method, routePath, handlers) {
    const compiled = compileRoute(routePath);
    layers.push({ type: "route", method, handlers, ...compiled });
  }

  return router;
}

function runHandlers(handlers, req, res, done) {
  let index = 0;
  const next = (error) => {
    if (error) return done(error);
    const handler = handlers[index++];
    if (!handler) return;
    try {
      const result = handler(req, res, next);
      if (result?.catch) result.catch(done);
    } catch (caught) {
      done(caught);
    }
  };
  next();
}

export const createApp = createRouter;
export const Router = createRouter;

export function jsonMiddleware({ limit = 2 * 1024 * 1024 } = {}) {
  const maxBytes = typeof limit === "number" ? limit : 2 * 1024 * 1024;
  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) { req.body = {}; return next(); }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) req.destroy(new Error("Request body too large"));
      else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        req.body = text ? JSON.parse(text) : {};
        next();
      } catch {
        res.status(400).json({ error: "Invalid JSON body" });
      }
    });
    req.on("error", next);
  };
}

export function cookieParser(req, _res, next) {
  req.cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    req.cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  next();
}

export function corsMiddleware(origins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}

export function staticMiddleware(directory) {
  const root = path.resolve(directory);
  return (req, res, next) => {
    if (req.method !== "GET") return next();
    const relative = req.path.replace(/^\/+/, "");
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return next();
    res.sendFile(filename);
  };
}
