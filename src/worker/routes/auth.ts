import type { AppRouter } from "./hono";

import { registerAuthLoginRoutes } from "./authLogin";
import { registerAuthRepositoryRoutes } from "./authRepositories";
import { registerAuthTokenRoutes } from "./authTokens";

export function registerAuthRoutes(router: AppRouter) {
  registerAuthLoginRoutes(router);
  registerAuthTokenRoutes(router);
  registerAuthRepositoryRoutes(router);
}
