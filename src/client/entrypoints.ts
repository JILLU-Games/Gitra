export const clientEntrypoints = {
  styles: "src/client/entries/styles.ts",
  shell: "src/client/entries/shell.ts",
  homePage: "src/client/entries/home-page.ts",
  ownerPage: "src/client/entries/owner-page.ts",
  overviewPage: "src/client/entries/overview-page.ts",
  treePage: "src/client/entries/tree-page.ts",
  blobPage: "src/client/entries/blob-page.ts",
  commitPage: "src/client/entries/commit-page.ts",
  commitsPage: "src/client/entries/commits-page.ts",
  adminPage: "src/client/entries/admin-page.ts",
  systemAdminPage: "src/client/entries/system-admin-page.ts",
  adminUsersPage: "src/client/entries/admin-users-page.ts",
  adminSettingsPage: "src/client/entries/admin-settings-page.ts",
  accountPage: "src/client/entries/account-page.ts",
} as const;

export type ClientEntrypoint = (typeof clientEntrypoints)[keyof typeof clientEntrypoints];
