import { handle } from "../../server/runtime.js";

export default (request) => handle(request);

export const config = { path: "/api/*" };
