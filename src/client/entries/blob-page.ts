import { initBlobActions } from "@/client/islands/blob-actions";
import { initBlobEditorIsland } from "@/client/islands/blob-editor";
import { initCodeLineAnchors } from "@/client/islands/code-line-anchors";
import { initRefPicker } from "@/client/islands/ref-picker";
import { onReady } from "../on-ready";

onReady(() => {
  initRefPicker();
  initBlobActions();
  initBlobEditorIsland();
  if (document.getElementById("blob-code")) {
    initCodeLineAnchors();
  }
});
