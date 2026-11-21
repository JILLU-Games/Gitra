import { initHomeReposIsland } from "@/client/islands/home-repos";
import { onReady } from "../on-ready";

onReady(() => {
  initHomeReposIsland();
});
