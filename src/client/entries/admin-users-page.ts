import { initAdminUsersIsland } from "@/client/islands/admin-users";
import { onReady } from "../on-ready";

onReady(() => {
  initAdminUsersIsland();
});
