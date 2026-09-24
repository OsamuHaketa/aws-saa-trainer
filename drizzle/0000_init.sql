CREATE TABLE `cards` (
	`question_id` text PRIMARY KEY NOT NULL,
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
	`first_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `followups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_log_id` integer NOT NULL,
	`source_question_id` text NOT NULL,
	`atom_id` text NOT NULL,
	`confused_atom_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by_question_id` text
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
	`followup_id` integer
);
