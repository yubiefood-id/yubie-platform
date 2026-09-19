import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { knowledgeItems, knowledgeVersions } from "../schema/index.js";

export interface ApprovedKnowledge {
  data: unknown;
  source: string;
  version: number;
  effectiveAt: string;
}

export class PostgresKnowledgeRepository {
  constructor(private readonly database: Database) {}

  async getEffectivePublicKnowledge(
    type: string,
    scopeId: string | null,
    at: string = new Date().toISOString(),
  ): Promise<ApprovedKnowledge | null> {
    const items = await this.database.db
      .select()
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.type, type),
          eq(knowledgeItems.approvalStatus, "APPROVED_PUBLIC"),
          scopeId ? eq(knowledgeItems.scopeId, scopeId) : isNull(knowledgeItems.scopeId),
        ),
      )
      .limit(1);

    const item = items[0];
    if (!item) return null;

    const versions = await this.database.db
      .select()
      .from(knowledgeVersions)
      .where(
        and(
          eq(knowledgeVersions.knowledgeId, item.id),
          lte(knowledgeVersions.effectiveFrom, at),
          or(isNull(knowledgeVersions.effectiveUntil), sql`${knowledgeVersions.effectiveUntil} > ${at}`),
        ),
      )
      .orderBy(sql`${knowledgeVersions.version} DESC`)
      .limit(1);

    const version = versions[0];
    if (!version) return null;

    let data: unknown;
    try {
      data = JSON.parse(version.approvedContent);
    } catch {
      data = version.approvedContent;
    }

    return {
      data,
      source: version.sourceReference ?? item.id,
      version: version.version,
      effectiveAt: version.effectiveFrom,
    };
  }
}
