CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- ユーザーの区別がなかったころの学習記録は、持ち主ユーザー local-owner に割り当てる。
-- 記録が 1 件もない DB（Turso の新しい DB など）では作らない。本番への取り込みは scripts/import-local.ts で行う
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `created_at`, `updated_at`)
SELECT 'local-owner', 'Local owner', 'local-owner@localhost', 0, CAST(strftime('%s', 'now') AS integer) * 1000, CAST(strftime('%s', 'now') AS integer) * 1000
WHERE EXISTS (SELECT 1 FROM `cards`) OR EXISTS (SELECT 1 FROM `review_logs`) OR EXISTS (SELECT 1 FROM `followups`);--> statement-breakpoint
CREATE TABLE `__new_cards` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`state` integer NOT NULL,
	`last_review` integer,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `question_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_cards`("user_id", "question_id", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses", "state", "last_review", "first_seen_at") SELECT 'local-owner', "question_id", "due", "stability", "difficulty", "elapsed_days", "scheduled_days", "learning_steps", "reps", "lapses", "state", "last_review", "first_seen_at" FROM `cards`;--> statement-breakpoint
DROP TABLE `cards`;--> statement-breakpoint
ALTER TABLE `__new_cards` RENAME TO `cards`;--> statement-breakpoint
CREATE TABLE `__new_review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_type` text NOT NULL,
	`atom_ids` text NOT NULL,
	`answered_at` integer NOT NULL,
	`correct` integer NOT NULL,
	`guessed` integer NOT NULL,
	`rating` integer NOT NULL,
	`selected_choice_id` text NOT NULL,
	`selected_atom_id` text,
	`correct_atom_id` text,
	`shown_choice_ids` text NOT NULL,
	`response_time_ms` integer NOT NULL,
	`mistake_type` text,
	`state_before` integer NOT NULL,
	`due_after` integer NOT NULL,
	`followup_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_review_logs`("id", "user_id", "question_id", "question_type", "atom_ids", "answered_at", "correct", "guessed", "rating", "selected_choice_id", "selected_atom_id", "correct_atom_id", "shown_choice_ids", "response_time_ms", "mistake_type", "state_before", "due_after", "followup_id") SELECT "id", 'local-owner', "question_id", "question_type", "atom_ids", "answered_at", "correct", "guessed", "rating", "selected_choice_id", "selected_atom_id", "correct_atom_id", "shown_choice_ids", "response_time_ms", "mistake_type", "state_before", "due_after", "followup_id" FROM `review_logs`;--> statement-breakpoint
DROP TABLE `review_logs`;--> statement-breakpoint
ALTER TABLE `__new_review_logs` RENAME TO `review_logs`;--> statement-breakpoint
CREATE INDEX `review_logs_user_answered_idx` ON `review_logs` (`user_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `__new_followups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`source_log_id` integer NOT NULL,
	`source_question_id` text NOT NULL,
	`atom_id` text NOT NULL,
	`confused_atom_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by_question_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_followups`("id", "user_id", "source_log_id", "source_question_id", "atom_id", "confused_atom_id", "created_at", "resolved_at", "resolved_by_question_id") SELECT "id", 'local-owner', "source_log_id", "source_question_id", "atom_id", "confused_atom_id", "created_at", "resolved_at", "resolved_by_question_id" FROM `followups`;--> statement-breakpoint
DROP TABLE `followups`;--> statement-breakpoint
ALTER TABLE `__new_followups` RENAME TO `followups`;--> statement-breakpoint
CREATE INDEX `followups_user_open_idx` ON `followups` (`user_id`) WHERE `resolved_at` is null;--> statement-breakpoint
PRAGMA foreign_keys=ON;
