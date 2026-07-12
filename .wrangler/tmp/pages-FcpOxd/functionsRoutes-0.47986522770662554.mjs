import { onRequest as __api_js_onRequest } from "F:\\kg-checkin-main\\functions\\api.js"

export const routes = [
    {
      routePath: "/api",
      mountPath: "/",
      method: "",
      middlewares: [],
      modules: [__api_js_onRequest],
    },
  ]