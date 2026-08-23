CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`property_id` text,
	`label` text,
	`floors` integer,
	`has_lift` integer,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buildings_external_ref_unique` ON `buildings` (`external_ref`);--> statement-breakpoint
CREATE TABLE `lease_objects` (
	`lease_contract_id` text NOT NULL,
	`rental_unit_id` text NOT NULL,
	`object_role` text NOT NULL,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`lease_contract_id`, `rental_unit_id`, `object_role`)
);
--> statement-breakpoint
CREATE INDEX `lease_objects_lease_idx` ON `lease_objects` (`lease_contract_id`);--> statement-breakpoint
CREATE TABLE `lease_parties` (
	`lease_contract_id` text NOT NULL,
	`party_id` text NOT NULL,
	`role` text NOT NULL,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`lease_contract_id`, `party_id`, `role`)
);
--> statement-breakpoint
CREATE INDEX `lease_parties_party_idx` ON `lease_parties` (`party_id`);--> statement-breakpoint
CREATE TABLE `leases` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`primary_rental_unit_id` text,
	`status` text,
	`starts_on` text,
	`ends_on` text,
	`notice_on` text,
	`currency` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leases_external_ref_unique` ON `leases` (`external_ref`);--> statement-breakpoint
CREATE INDEX `leases_unit_idx` ON `leases` (`primary_rental_unit_id`);--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`outcome` text NOT NULL,
	`ip` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `login_events_at_idx` ON `login_events` (`at`);--> statement-breakpoint
CREATE TABLE `management_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`legal_name` text,
	`canton_code` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `management_companies_external_ref_unique` ON `management_companies` (`external_ref`);--> statement-breakpoint
CREATE TABLE `meter_points` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`rental_unit_id` text,
	`meter_kind` text,
	`unit_of_measure` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meter_points_external_ref_unique` ON `meter_points` (`external_ref`);--> statement-breakpoint
CREATE INDEX `meter_points_unit_idx` ON `meter_points` (`rental_unit_id`);--> statement-breakpoint
CREATE TABLE `meter_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`meter_point_id` text,
	`reading_on` text,
	`value` real,
	`reading_source` text,
	`created_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `meter_readings_point_idx` ON `meter_readings` (`meter_point_id`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`party_kind` text,
	`display_name` text,
	`first_name` text,
	`last_name` text,
	`email` text,
	`phone_e164` text,
	`locale` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parties_external_ref_unique` ON `parties` (`external_ref`);--> statement-breakpoint
CREATE TABLE `payment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_contract_id` text,
	`status` text,
	`monthly_amount_chf` real,
	`starts_on` text,
	`ends_on` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `payment_plans_lease_idx` ON `payment_plans` (`lease_contract_id`);--> statement-breakpoint
CREATE TABLE `planned_maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`building_id` text,
	`category` text,
	`status` text,
	`planned_for` text,
	`description` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_maintenance_external_ref_unique` ON `planned_maintenance` (`external_ref`);--> statement-breakpoint
CREATE INDEX `maintenance_building_idx` ON `planned_maintenance` (`building_id`);--> statement-breakpoint
CREATE INDEX `maintenance_planned_for_idx` ON `planned_maintenance` (`planned_for`);--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`management_company_id` text,
	`name` text,
	`region_name` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolios_external_ref_unique` ON `portfolios` (`external_ref`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`portfolio_id` text,
	`name` text,
	`street_name` text,
	`street_number` text,
	`postal_code` text,
	`locality` text,
	`construction_year` integer,
	`energy_label` text,
	`address_is_synthetic` integer,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `properties_external_ref_unique` ON `properties` (`external_ref`);--> statement-breakpoint
CREATE TABLE `rent_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_contract_id` text,
	`effective_from` text,
	`effective_to` text,
	`base_rent_chf` real,
	`service_charges_chf` real,
	`parking_charges_chf` real,
	`indexed_on` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `rent_terms_lease_idx` ON `rent_terms` (`lease_contract_id`);--> statement-breakpoint
CREATE TABLE `rental_units` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`building_id` text,
	`unit_kind` text,
	`label` text,
	`floor_label` text,
	`rooms` integer,
	`surface_m2` real,
	`occupancy_status` text,
	`rentable_from` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`archived_at` text,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rental_units_external_ref_unique` ON `rental_units` (`external_ref`);--> statement-breakpoint
CREATE INDEX `rental_units_building_idx` ON `rental_units` (`building_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_cursor` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_change_id` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`started_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`finished_at` text,
	`events_applied` integer DEFAULT 0 NOT NULL,
	`cursor_before` integer,
	`cursor_after` integer,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `sync_runs_started_idx` ON `sync_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `tenant_account_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`lease_contract_id` text,
	`entry_kind` text,
	`direction` text,
	`status` text,
	`amount_chf` real,
	`due_on` text,
	`settled_on` text,
	`description` text,
	`created_at` text,
	`updated_at` text,
	`source_revision` integer,
	`synced_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_account_entries_external_ref_unique` ON `tenant_account_entries` (`external_ref`);--> statement-breakpoint
CREATE INDEX `entries_lease_idx` ON `tenant_account_entries` (`lease_contract_id`);--> statement-breakpoint
CREATE INDEX `entries_due_idx` ON `tenant_account_entries` (`due_on`);--> statement-breakpoint
CREATE TABLE `ticket_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_kind` text NOT NULL,
	`kind` text DEFAULT 'comment' NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_comments_ticket_idx` ON `ticket_comments` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_ref` text NOT NULL,
	`lease_ref` text,
	`unit_ref` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tickets_tenant_idx` ON `tickets` (`tenant_ref`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`tenant_ref` text,
	`display_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);