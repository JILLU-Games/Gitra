import { initChangePasswordIsland } from "@/client/islands/change-password";
import { initRepositoriesIsland } from "@/client/islands/repositories";
import { initTokensIsland } from "@/client/islands/tokens";
import { onReady } from "../on-ready";

onReady(() => {
  initChangePasswordIsland();
  initRepositoriesIsland();
  initTokensIsland();
});
