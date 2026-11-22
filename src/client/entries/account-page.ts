import { initChangePasswordIsland } from "@/client/islands/change-password";
import { initProfileSettingsIsland } from "@/client/islands/profile-settings";
import { initRepositoriesIsland } from "@/client/islands/repositories";
import { initTokensIsland } from "@/client/islands/tokens";
import { onReady } from "../on-ready";

onReady(() => {
  initProfileSettingsIsland();
  initChangePasswordIsland();
  initRepositoriesIsland();
  initTokensIsland();
});
