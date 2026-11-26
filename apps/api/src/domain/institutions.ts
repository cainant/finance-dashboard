import type { Database, Institution as InstitutionRow } from "@fd/database";
import { institutions } from "@fd/database/schema";
import type { ProviderId, ProviderInstitution } from "@fd/financial-providers";
import { and, eq } from "drizzle-orm";

/**
 * Upsert idempotente de instituição por `(provider, external_id)`.
 * A instituição é global (não pertence a um usuário).
 */
export async function upsertInstitution(
  db: Database,
  provider: ProviderId,
  institution: ProviderInstitution,
): Promise<InstitutionRow> {
  const [row] = await db
    .insert(institutions)
    .values({
      id: crypto.randomUUID(),
      provider,
      externalId: institution.externalId,
      name: institution.name,
      logoUrl: institution.logoUrl ?? null,
      primaryColor: institution.primaryColor ?? null,
      type: institution.type,
    })
    .onConflictDoUpdate({
      target: [institutions.provider, institutions.externalId],
      set: {
        name: institution.name,
        logoUrl: institution.logoUrl ?? null,
        primaryColor: institution.primaryColor ?? null,
        type: institution.type,
      },
    })
    .returning();

  if (!row) {
    const [existing] = await db
      .select()
      .from(institutions)
      .where(
        and(
          eq(institutions.provider, provider),
          eq(institutions.externalId, institution.externalId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Falha ao salvar instituição");
    return existing;
  }

  return row;
}
