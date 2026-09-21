import { handle } from "./lib/_api.mjs";

export default async function (req, context) {
  const pathname = new URL(req.url).pathname;
  return handle(req, pathname);
}

export const config = { path: "/api/*" };