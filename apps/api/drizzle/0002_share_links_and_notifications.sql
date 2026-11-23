CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_path" text,
	"link_label" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_guest" (
	"id" text PRIMARY KEY NOT NULL,
	"share_link_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_guest_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "share_link" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"label" text NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "reservation" ALTER COLUMN "reserved_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "reserved_by_guest_id" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_guest" ADD CONSTRAINT "share_guest_share_link_id_share_link_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "share_link_profile_idx" ON "share_link" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_reserved_by_guest_id_share_guest_id_fk" FOREIGN KEY ("reserved_by_guest_id") REFERENCES "public"."share_guest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_user_idx" ON "reservation" USING btree ("reserved_by_user_id");--> statement-breakpoint
CREATE INDEX "reservation_guest_idx" ON "reservation" USING btree ("reserved_by_guest_id");--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_one_owner" CHECK (("reservation"."reserved_by_user_id" IS NULL) <> ("reservation"."reserved_by_guest_id" IS NULL));