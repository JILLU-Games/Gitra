import { initOwnerProfileActionIsland } from "@/client/islands/owner-profile";
import { onReady } from "../on-ready";

onReady(() => {
  initOwnerProfileActionIsland();
});
