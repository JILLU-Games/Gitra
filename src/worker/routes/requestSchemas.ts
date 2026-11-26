import { z } from "zod";

// Route handlers historically treated malformed JSON bodies as empty objects
// and then let field-specific validation choose the public error. These
// preprocessors preserve that behavior while moving the structural parsing to
// zod.
function objectOrEmpty(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

const TrimmedStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string()
);

const StringOrEmptySchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string()
);

const LowercaseSlugInputSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
  z.string()
);

const RepositoryVisibilitySchema = z.enum(["public", "private"]);

const NullableRepositoryVisibilitySchema = z.preprocess(
  (value) => (value === "public" || value === "private" ? value : null),
  RepositoryVisibilitySchema.nullable()
);

export const RepositoryCreateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    namespaceSlug: LowercaseSlugInputSchema,
    slug: LowercaseSlugInputSchema,
    visibility: NullableRepositoryVisibilitySchema,
    description: StringOrEmptySchema,
    initializeReadme: z.preprocess((value) => value === true, z.boolean()),
    initializeProfileReadme: z.preprocess((value) => value === true, z.boolean()),
  })
);

export const RepositoryVisibilityRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    visibility: NullableRepositoryVisibilitySchema,
  })
);

export const RepositoryPatchRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    visibility: z.preprocess(
      (value) =>
        value === undefined ? undefined : value === "public" || value === "private" ? value : null,
      RepositoryVisibilitySchema.nullable().optional()
    ),
    description: z.preprocess(
      (value) => (typeof value === "string" ? value : undefined),
      z.string().optional()
    ),
    pinned: z.preprocess(
      (value) => (typeof value === "boolean" ? value : undefined),
      z.boolean().optional()
    ),
    homePinned: z.preprocess(
      (value) => (typeof value === "boolean" ? value : undefined),
      z.boolean().optional()
    ),
  })
);

export const ProfileReadmeUpdateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    content: StringOrEmptySchema,
    message: TrimmedStringSchema,
  })
);

export const RepoFileUpdateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    path: TrimmedStringSchema,
    content: StringOrEmptySchema,
    message: TrimmedStringSchema,
    ref: TrimmedStringSchema,
  })
);

export const ProfileMetaUpdateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    displayName: z.preprocess(
      (value) => (typeof value === "string" ? value : undefined),
      z.string().optional()
    ),
    bio: StringOrEmptySchema,
    location: TrimmedStringSchema,
    website: TrimmedStringSchema,
  })
);

const PatGrantLevelSchema = z.enum(["pull", "push"]);

const NullablePatGrantLevelSchema = z.preprocess(
  (value) => (value === "pull" || value === "push" ? value : null),
  PatGrantLevelSchema.nullable()
);

const PatNamespaceCreateRequestSchema = z.object({
  scope: z.literal("namespace"),
  name: TrimmedStringSchema,
  namespaceSlug: LowercaseSlugInputSchema,
  level: NullablePatGrantLevelSchema,
});

const PatRepoCreateRequestSchema = z.object({
  scope: z.literal("repo"),
  name: TrimmedStringSchema,
  namespaceSlug: LowercaseSlugInputSchema,
  repoSlug: LowercaseSlugInputSchema,
  level: NullablePatGrantLevelSchema,
});

const PatGlobalCreateRequestSchema = z.object({
  scope: z.literal("global"),
  name: TrimmedStringSchema,
  level: NullablePatGrantLevelSchema,
});

export const PatCreateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.discriminatedUnion("scope", [
    PatNamespaceCreateRequestSchema,
    PatRepoCreateRequestSchema,
    PatGlobalCreateRequestSchema,
  ])
);

export const AdminCompactionRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    dryRun: z.preprocess(
      (value) => (value === false ? false : undefined),
      z.literal(false).optional()
    ),
  })
);

export const AdminRefsPayloadSchema = z.array(
  z
    .object({
      name: z.string(),
      oid: z.string(),
    })
    .passthrough()
);

export const AdminHeadPayloadSchema = z
  .object({
    target: z.string(),
    oid: z.string().optional(),
    unborn: z.boolean().optional(),
  })
  .passthrough();

export const AdminPurgeRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    confirm: StringOrEmptySchema,
  })
);

export const AdminLoginRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    username: TrimmedStringSchema,
    password: StringOrEmptySchema,
    next: TrimmedStringSchema,
    account: TrimmedStringSchema.optional(),
  })
);

export const ProductionSetupRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    username: LowercaseSlugInputSchema,
    displayName: TrimmedStringSchema.optional(),
    password: StringOrEmptySchema,
    confirmPassword: StringOrEmptySchema,
    next: TrimmedStringSchema,
  })
);

const DirectoryRoleSchema = z.enum(["admin", "member", "viewer"]);
const DirectoryStatusSchema = z.enum(["active", "disabled"]);

function parseOptionalRole(value: unknown): "admin" | "member" | "viewer" | undefined {
  return value === "admin" || value === "member" || value === "viewer" ? value : undefined;
}

export const AdminNamespaceCreateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    handle: TrimmedStringSchema,
    displayName: TrimmedStringSchema,
    role: z.preprocess((value) => parseOptionalRole(value) ?? "member", DirectoryRoleSchema),
    status: z.preprocess(
      (value) => (value === "active" || value === "disabled" ? value : "active"),
      DirectoryStatusSchema
    ),
    password: z.preprocess(
      (value) => (typeof value === "string" && value.length > 0 ? value : undefined),
      z.string().optional()
    ),
  })
);

export const AdminNamespacePatchRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    handle: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : undefined),
      z.string().optional()
    ),
    displayName: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : undefined),
      z.string().optional()
    ),
    role: z.preprocess(parseOptionalRole, DirectoryRoleSchema.optional()),
    status: z.preprocess(
      (value) => (value === "active" || value === "disabled" ? value : undefined),
      DirectoryStatusSchema.optional()
    ),
    password: z.preprocess(
      (value) => (typeof value === "string" && value.length > 0 ? value : undefined),
      z.string().optional()
    ),
  })
);

export const ChangePasswordRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    currentPassword: StringOrEmptySchema,
    newPassword: StringOrEmptySchema,
  })
);

export const AdminRepositoryDeleteRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    confirm: TrimmedStringSchema,
  })
);

const OptionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional()
);

const OptionalBooleanSchema = z.preprocess(
  (value) => (typeof value === "boolean" ? value : undefined),
  z.boolean().optional()
);

export const AdminSettingsUpdateRequestSchema = z.preprocess(
  objectOrEmpty,
  z.object({
    siteName: OptionalStringSchema,
    shortName: OptionalStringSchema,
    siteTitle: OptionalStringSchema,
    metaTitle: OptionalStringSchema,
    metaDescription: OptionalStringSchema,
    metaKeywords: OptionalStringSchema,
    logoUrl: OptionalStringSchema,
    faviconUrl: OptionalStringSchema,
    ogImageUrl: OptionalStringSchema,
    allowIndexing: OptionalBooleanSchema,
    tagline: OptionalStringSchema,
    heroTitle: OptionalStringSchema,
    heroDescription: OptionalStringSchema,
    workspaceName: OptionalStringSchema,
    websiteUrl: OptionalStringSchema,
    websiteLabel: OptionalStringSchema,
    docsUrl: OptionalStringSchema,
    supportEmail: OptionalStringSchema,
    footerText: OptionalStringSchema,
  })
);
