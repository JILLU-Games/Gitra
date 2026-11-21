import type {
  AdminNamespaceEntry,
  AdminRepositoryEntry,
  AdminTokenEntry,
} from "@/shared/admin/panel";

export type SystemAdminSection = "overview" | "repositories" | "tokens";

export type SystemAdminIslandProps = {
  activeSection?: SystemAdminSection;
  authMode?: "demo" | "configured";
  origin: string;
  primaryNamespaceSlug?: string;
  namespaces: AdminNamespaceEntry[];
  repositories: AdminRepositoryEntry[];
  tokens: AdminTokenEntry[];
};
