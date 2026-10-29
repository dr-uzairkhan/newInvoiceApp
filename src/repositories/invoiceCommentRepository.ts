import { prisma } from "@/lib/prisma";
import type { InvoiceComment } from "@/generated/prisma/client";

/** Thin Prisma wrappers only — no validation, no business rules. */
export type InvoiceCommentWriteInput = {
  invoiceId: string;
  authorUserId: string | null;
  body: string;
};

export type InvoiceCommentWithAuthor = InvoiceComment & {
  author: { id: string; name: string | null; email: string } | null;
};

/** Per-invoice rollup for list rows: how many comments, and the newest one. */
export type InvoiceCommentSummary = {
  count: number;
  latestBody: string;
  latestAt: Date;
};

const AUTHOR_SELECT = { select: { id: true, name: true, email: true } };

function findByInvoice(invoiceId: string): Promise<InvoiceCommentWithAuthor[]> {
  return prisma.invoiceComment.findMany({
    where: { invoiceId },
    include: { author: AUTHOR_SELECT },
    orderBy: { createdAt: "desc" },
  });
}

function findById(id: string): Promise<InvoiceComment | null> {
  return prisma.invoiceComment.findUnique({ where: { id } });
}

function create(data: InvoiceCommentWriteInput): Promise<InvoiceComment> {
  return prisma.invoiceComment.create({ data });
}

function deleteById(id: string): Promise<InvoiceComment> {
  return prisma.invoiceComment.delete({ where: { id } });
}

/**
 * One count query plus one "newest per invoice" query for a whole list page,
 * rather than a per-row lookup. `distinct` keeps the first row per
 * `invoiceId` in the given order, i.e. the most recent comment.
 */
async function summarizeByInvoiceIds(
  invoiceIds: string[],
): Promise<Map<string, InvoiceCommentSummary>> {
  const summaries = new Map<string, InvoiceCommentSummary>();
  if (invoiceIds.length === 0) return summaries;

  const [counts, latest] = await Promise.all([
    prisma.invoiceComment.groupBy({
      by: ["invoiceId"],
      where: { invoiceId: { in: invoiceIds } },
      _count: { _all: true },
    }),
    prisma.invoiceComment.findMany({
      where: { invoiceId: { in: invoiceIds } },
      orderBy: [{ invoiceId: "asc" }, { createdAt: "desc" }],
      distinct: ["invoiceId"],
      select: { invoiceId: true, body: true, createdAt: true },
    }),
  ]);

  const countByInvoiceId = new Map(
    counts.map((row) => [row.invoiceId, row._count._all]),
  );
  for (const row of latest) {
    summaries.set(row.invoiceId, {
      count: countByInvoiceId.get(row.invoiceId) ?? 1,
      latestBody: row.body,
      latestAt: row.createdAt,
    });
  }
  return summaries;
}

export const invoiceCommentRepository = {
  findByInvoice,
  findById,
  create,
  deleteById,
  summarizeByInvoiceIds,
};
