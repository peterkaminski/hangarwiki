import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // nanoid
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  publicKey: text('public_key'), // Ed25519 public key (base64)
  encryptedPrivateKey: text('encrypted_private_key'), // AES-256-GCM encrypted
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // nanoid
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const magicLinks = sqliteTable('magic_links', {
  id: text('id').primaryKey(), // nanoid
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const wikis = sqliteTable('wikis', {
  id: text('id').primaryKey(), // nanoid
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  forgeOwner: text('forge_owner').notNull(), // username on Forgejo/Gitea
  forgeRepo: text('forge_repo').notNull(), // repo name on Forgejo/Gitea
  visibility: text('visibility').notNull().$type<'public' | 'private'>().default('public'),
  incipientLinkStyle: text('incipient_link_style').notNull().$type<'create' | 'highlight'>().default('create'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const wikiMembers = sqliteTable('wiki_members', {
  id: text('id').primaryKey(), // nanoid
  wikiId: text('wiki_id').notNull().references(() => wikis.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().$type<'owner' | 'editor' | 'viewer'>(),
  invitedAt: text('invited_at').notNull().$defaultFn(() => new Date().toISOString()),
  acceptedAt: text('accepted_at'),
});

export const pageIndex = sqliteTable('page_index', {
  id: text('id').primaryKey(), // nanoid
  wikiId: text('wiki_id').notNull().references(() => wikis.id),
  pagePath: text('page_path').notNull(), // relative path in repo
  title: text('title').notNull(),
  contentText: text('content_text'), // plain text for search (FTS later)
  updatedAt: text('updated_at').notNull(),
});
