import type {
  AdminNamespaceEntry,
  AdminRepositoryEntry,
  AdminTokenEntry,
} from "@/shared/admin/panel";

export type SystemAdminTab = "all" | "tokens" | "repositories";

export type SystemAdminIslandProps = {
  origin: string;
  primaryNamespaceSlug?: string;
  namespaces: AdminNamespaceEntry[];
  repositories: AdminRepositoryEntry[];
  tokens: AdminTokenEntry[];
};
