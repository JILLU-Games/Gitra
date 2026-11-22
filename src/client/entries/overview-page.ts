import { initProfileReadmeEditorIsland } from "@/client/islands/profile-readme-editor";
import { initRefPicker } from "@/client/islands/ref-picker";
import { initRepoOverviewActionsIsland } from "@/client/islands/repo-overview-actions";
import { onReady } from "../on-ready";

onReady(() => {
  initRefPicker();
  initRepoOverviewActionsIsland();
  initProfileReadmeEditorIsland();
});
