/*
  Warnings:

  - A unique constraint covering the columns `[phone_number]` on the table `whatsapp_leads` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "whatsapp_leads_phone_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_leads_phone_number_key" ON "whatsapp_leads"("phone_number");
