-- Gast-Reservierungen gehören ab jetzt direkt zum geteilten Link (der Link ist die Identität des Gastes).
-- Bestehende Reservierungen von Gästen werden auf ihren Link übertragen, danach entfällt die Gast-Tabelle.
ALTER TABLE "reservation" ADD COLUMN "reserved_by_share_link_id" text;--> statement-breakpoint
UPDATE "reservation" SET "reserved_by_share_link_id" = g."share_link_id" FROM "share_guest" g WHERE "reservation"."reserved_by_guest_id" = g."id";--> statement-breakpoint
ALTER TABLE "reservation" DROP CONSTRAINT "reservation_one_owner";--> statement-breakpoint
ALTER TABLE "reservation" DROP CONSTRAINT "reservation_reserved_by_guest_id_share_guest_id_fk";--> statement-breakpoint
DROP INDEX "reservation_guest_idx";--> statement-breakpoint
ALTER TABLE "reservation" DROP COLUMN "reserved_by_guest_id";--> statement-breakpoint
DROP TABLE "share_guest";--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_reserved_by_share_link_id_share_link_id_fk" FOREIGN KEY ("reserved_by_share_link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_share_link_idx" ON "reservation" USING btree ("reserved_by_share_link_id");--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_one_owner" CHECK (("reservation"."reserved_by_user_id" IS NULL) <> ("reservation"."reserved_by_share_link_id" IS NULL));
